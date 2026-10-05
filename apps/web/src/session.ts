import type { ConnectionPool } from "@streets/core/read/connection-pool";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { createActiveSigner } from "@streets/core/signer/active-signer";
import {
  createNip07Signer,
  waitForNip07,
  watchForNip07,
} from "@streets/core/signer/nip07-signer";
import { parseBunkerUri } from "@streets/core/signer/nip46/bunker-uri";
import {
  NostrConnectCancelledError,
  startNostrConnect,
} from "@streets/core/signer/nip46/nostrconnect";
import {
  type Nip46Session,
  connectNip46,
  restoreNip46,
} from "@streets/core/signer/nip46/session";
import {
  NIP46_SESSION_STORAGE_KEY,
  loadNip46Session,
  saveNip46Session,
} from "@streets/core/signer/nip46/session-storage";
import {
  LOGIN_METHOD_STORAGE_KEY,
  LOGIN_PUBKEY_STORAGE_KEY,
  loadLoginMethod,
  loadLoginPubkey,
  saveLoginMethod,
} from "@streets/core/signer/session-storage";
import {
  type Signer,
  SignerUnavailableError,
} from "@streets/core/signer/signer";
import { createSignal, onCleanup } from "solid-js";
import { createSignerWait, observeSigner } from "./signer-wait";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * ログインしている人の署名器が使えるか。`connecting` と `disconnected` の間も
 * その人の画面を出しておき、書き込みだけを待たせる・断る。
 */
export type SignerStatus = "none" | "connecting" | "ready" | "disconnected";

/** 署名器の側から繋いでもらう 1 回分。 */
export type ConnectAttempt = {
  uri: string;
  /** 繋がると解決する。取り消したときは `cancelled` で拒否する。 */
  done: Promise<void>;
  cancel: () => void;
};

export class ConnectCancelledError extends Error {}

// モバイルの Safari では、アプリを開き直した直後などに拡張機能が立ち上がり直すため、注入が 1 秒を超えて遅れる。
const NIP07_RESTORE_WAIT_MS = 5_000;
// 注入された後も、スマホの拡張機能は公開鍵を返さないまま止まることがある。
const NIP07_RESPONSE_WAIT_MS = 10_000;

const NIP07_NO_RESPONSE =
  "拡張機能から応答がありません。拡張機能がこのサイトで許可されているか確かめてください。使えるようになれば、そのままログインします。";

class TimeoutError extends Error {}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export const createSession = (
  pool: ConnectionPool,
  options: { nostrConnectRelays?: readonly RelayUrl[] } = {},
) => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [signerStatus, setSignerStatus] = createSignal<SignerStatus>("none");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [authUrl, setAuthUrl] = createSignal<URL>();
  // 保存したログインを戻せなかったが、消してはいない。署名器が戻れば試し直せる。
  const [restoreFailed, setRestoreFailed] = createSignal(false);
  const signerWait = createSignerWait();
  const signer = observeSigner(createActiveSigner(), signerWait);
  // リレーは認証した鍵を接続が切れるまで覚えているので、署名器を替えたら張り直す。
  // 戻すのを待っていた同じ人の署名器なら、認証も戻るのを待っていたので張り直さない。
  const setSigner = (next: Signer | undefined, account?: string) => {
    const awaited = signerStatus() === "connecting" && account === pubkey();
    signer.set(next);
    setSignerStatus(next ? "ready" : "none");
    if (!awaited || reauth) pool.resetAuthentication();
    reauth = false;
  };
  // 繋がっていない間は認証を断っているので、戻ったら張り直して認証させる。
  let reauth = false;
  // 復元を始め直したら、前の試みから遅れて届いた返事を当てない。
  let restoreAttempt = 0;
  let nip46: Nip46Session | undefined;
  onCleanup(() => nip46?.client.close());
  // 復元を諦めた後に拡張機能が現れたら、ユーザーに押させずにそのまま復元する。
  let stopWatchingNip07: (() => void) | undefined;
  const stopNip07Watch = () => {
    stopWatchingNip07?.();
    stopWatchingNip07 = undefined;
  };
  onCleanup(stopNip07Watch);

  const hooks = { onAuthUrl: (url: URL | undefined) => setAuthUrl(url) };

  const run = async (
    task: () => Promise<void>,
    waitMessage?: string,
    immediate = false,
  ) => {
    if (pending()) return;
    stopNip07Watch();
    setPending(true);
    setError(undefined);
    setAuthUrl(undefined);
    setRestoreFailed(false);
    try {
      if (waitMessage) {
        await signerWait.track(waitMessage, task, immediate ? 0 : undefined);
      } else {
        await task();
      }
    } finally {
      setPending(false);
    }
  };

  const activateNip46 = (session: Nip46Session) => {
    stopNip07Watch();
    restoreAttempt++;
    nip46?.client.close();
    nip46 = session;
    setSigner(session.signer, session.userPubkey);
    setAuthUrl(undefined);
    setPubkey(session.userPubkey);
    localStorage.removeItem(LOGIN_PUBKEY_STORAGE_KEY);
    localStorage.setItem(
      NIP46_SESSION_STORAGE_KEY,
      saveNip46Session(session.stored),
    );
    localStorage.setItem(LOGIN_METHOD_STORAGE_KEY, saveLoginMethod("nip46"));
  };

  const activateExtension = (extension: Signer, pk: string) => {
    stopNip07Watch();
    restoreAttempt++;
    nip46?.client.close();
    nip46 = undefined;
    setSigner(extension, pk);
    setPubkey(pk);
    setError(undefined);
    setRestoreFailed(false);
    localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
    localStorage.setItem(LOGIN_METHOD_STORAGE_KEY, saveLoginMethod("nip07"));
    localStorage.setItem(LOGIN_PUBKEY_STORAGE_KEY, pk);
  };

  /**
   * 戻せなかった。覚えていた人がいれば、その人の画面を読み取りだけで残す
   * （スマホでは署名器が一時的に止まっているだけのことが多い）。
   */
  const restoreFailedWith = (message: string) => {
    if (pubkey()) {
      signer.disconnect();
      setSignerStatus("disconnected");
      reauth = true;
    } else {
      signer.set(undefined);
      setSignerStatus("none");
    }
    setError(message);
    setRestoreFailed(true);
  };

  const loginWithExtension = () =>
    run(
      async () => {
        try {
          const extension = createNip07Signer();
          activateExtension(extension, await extension.getPublicKey());
        } catch (e) {
          setError(
            e instanceof SignerUnavailableError
              ? "NIP-07 対応の拡張機能が見つかりません。"
              : `ログインに失敗しました: ${errorText(e)}`,
          );
        }
      },
      "ログインを待っています",
      true,
    );

  const loginWithBunker = (uri: string) =>
    run(
      async () => {
        try {
          activateNip46(
            await connectNip46({
              pool,
              bunker: parseBunkerUri(uri),
              hooks,
              metadataUrl: location.origin,
            }),
          );
        } catch (e) {
          setError(`リモート署名器に接続できませんでした: ${errorText(e)}`);
        }
      },
      "ログインを待っています",
      true,
    );

  const loginWithNostrConnect = (): ConnectAttempt => {
    const attempt = startNostrConnect({
      pool,
      relays: options.nostrConnectRelays,
      metadata: { name: "Streets", url: location.origin },
      hooks,
    });
    const done = attempt.session.then(activateNip46, (e) => {
      throw e instanceof NostrConnectCancelledError
        ? new ConnectCancelledError()
        : e;
    });
    return { uri: attempt.uri, done, cancel: attempt.cancel };
  };

  // 覚えていた人の画面を先に出し、署名器が戻るまで署名を待たせる。
  const beginRestore = (known: string | undefined) => {
    if (known) setPubkey(known);
    if (pubkey()) {
      signer.expect();
      setSignerStatus("connecting");
    }
  };

  const restore = () => {
    if (pending()) return;
    const attempt = ++restoreAttempt;
    const methodRaw = localStorage.getItem(LOGIN_METHOD_STORAGE_KEY);
    const method = loadLoginMethod(methodRaw);
    if (methodRaw !== null && method === undefined) {
      localStorage.removeItem(LOGIN_METHOD_STORAGE_KEY);
    }
    if (method === "nip07") {
      beginRestore(
        loadLoginPubkey(localStorage.getItem(LOGIN_PUBKEY_STORAGE_KEY)),
      );
      void run(async () => {
        if (!(await waitForNip07(NIP07_RESTORE_WAIT_MS))) {
          // まだ立ち上がっていないだけのこともあるので、無いとは言い切らない。
          restoreFailedWith(NIP07_NO_RESPONSE);
          stopWatchingNip07 = watchForNip07(restore);
          return;
        }
        const extension = createNip07Signer();
        const answer = extension.getPublicKey();
        try {
          activateExtension(
            extension,
            await withTimeout(answer, NIP07_RESPONSE_WAIT_MS),
          );
        } catch (e) {
          if (!(e instanceof TimeoutError)) {
            restoreFailedWith(`ログインの復元に失敗しました: ${errorText(e)}`);
            return;
          }
          restoreFailedWith(NIP07_NO_RESPONSE);
          // 待つのをやめても、拡張機能が遅れて返してくれたらそのまま使う。
          answer.then(
            (pk) => {
              if (attempt === restoreAttempt) activateExtension(extension, pk);
            },
            () => {},
          );
        }
      }, "ログインの復元を待っています");
      return;
    }

    const raw = localStorage.getItem(NIP46_SESSION_STORAGE_KEY);
    // login-method 導入前に保存された NIP-46 セッションも引き続き復元する。
    if (method !== "nip46" && raw === null) return;
    const stored = loadNip46Session(raw);
    if (!stored) {
      // 必要な権限が増えると古い保存形式は読めなくなり、再接続でしか承認し直せない。
      localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
      localStorage.removeItem(LOGIN_METHOD_STORAGE_KEY);
      setError(
        "署名器の権限が更新されました。リモート署名器で繋ぎ直してください。",
      );
      return;
    }
    beginRestore(stored.userPubkey);
    void run(async () => {
      try {
        activateNip46(await restoreNip46({ pool, stored, hooks }));
      } catch {
        restoreFailedWith(
          "署名器と繋がりませんでした。署名器のアプリが動いているか確かめて、もう一度試してください。",
        );
      }
    }, "ログインの復元を待っています");
  };

  // 署名器のアプリへ切り替えて戻ってきたら、押させずに繋ぎ直す。
  const retryOnReturn = () => {
    if (!document.hidden && signerStatus() === "disconnected") restore();
  };
  document.addEventListener("visibilitychange", retryOnReturn);
  onCleanup(() =>
    document.removeEventListener("visibilitychange", retryOnReturn),
  );

  const logout = () => {
    stopNip07Watch();
    restoreAttempt++;
    const session = nip46;
    nip46 = undefined;
    setSigner(undefined);
    setPubkey(undefined);
    setAuthUrl(undefined);
    setError(undefined);
    setRestoreFailed(false);
    localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
    localStorage.removeItem(LOGIN_METHOD_STORAGE_KEY);
    localStorage.removeItem(LOGIN_PUBKEY_STORAGE_KEY);
    if (!session) return;
    // logout RPC は署名器への通知にすぎない。応答しない署名器でも接続を閉じられるよう上限を切る。
    void Promise.race([
      session.client.request("logout"),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
      .catch(() => {})
      .finally(() => session.client.close());
  };

  return {
    pubkey,
    signerStatus,
    pending,
    error,
    authUrl,
    signer,
    signerWaits: signerWait.messages,
    loginWithExtension,
    loginWithBunker,
    loginWithNostrConnect,
    restore,
    restoreFailed,
    logout,
  };
};

export type Session = ReturnType<typeof createSession>;
