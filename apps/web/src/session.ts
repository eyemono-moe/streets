import type { ConnectionPool } from "@streets/core/read/connection-pool";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { createActiveSigner } from "@streets/core/signer/active-signer";
import {
  type LoginConnection,
  Nip07NotReadyError,
  connectNip07,
  nip46Connection,
  restoreNip07,
} from "@streets/core/signer/login/connection";
import {
  type LoginEvent,
  initialLoginState,
  needsAuthReset,
  reduceLogin,
} from "@streets/core/signer/login/login-state";
import {
  LEGACY_LOGIN_KEYS,
  LOGIN_STORAGE_KEY,
  type StoredLogin,
  loadStoredLogin,
  saveStoredLogin,
  storedLoginPubkey,
} from "@streets/core/signer/login/stored-login";
import { watchForNip07 } from "@streets/core/signer/nip07-signer";
import {
  type BunkerConnection,
  parseBunkerUri,
} from "@streets/core/signer/nip46/bunker-uri";
import {
  NOSTRCONNECT_ATTEMPT_STORAGE_KEY,
  NostrConnectCancelledError,
  loadNostrConnectAttempt,
  saveNostrConnectAttempt,
  startNostrConnect,
} from "@streets/core/signer/nip46/nostrconnect";
import { connectNip46, restoreNip46 } from "@streets/core/signer/nip46/session";
import { SignerUnavailableError } from "@streets/core/signer/signer";
import { createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  type SignerTags,
  nip07Tags,
  nip46Tags,
  reportSignerError,
  reportSignerFailures,
  watchHidden,
} from "./signer-report";
import { createSignerWait, observeSigner } from "./signer-wait";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** 署名器の側から繋いでもらう 1 回分。 */
export type ConnectAttempt = {
  uri: string;
  /** 読み込み直す前に始めた試みを続けている。 */
  resumed: boolean;
  /** 繋がると解決する。取り消したときは `cancelled` で拒否する。 */
  done: Promise<void>;
  cancel: () => void;
};

export class ConnectCancelledError extends Error {}

// プライベートブラウズなどで sessionStorage が使えなくても、その回だけは繋げる。
const pendingAttempt = {
  read: (): string | null => {
    try {
      return sessionStorage.getItem(NOSTRCONNECT_ATTEMPT_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  write: (value: string) => {
    try {
      sessionStorage.setItem(NOSTRCONNECT_ATTEMPT_STORAGE_KEY, value);
    } catch {}
  },
  clear: () => {
    try {
      sessionStorage.removeItem(NOSTRCONNECT_ATTEMPT_STORAGE_KEY);
    } catch {}
  },
};

const storedLogin = {
  write: (login: StoredLogin) => {
    localStorage.setItem(LOGIN_STORAGE_KEY, saveStoredLogin(login));
    for (const key of LEGACY_LOGIN_KEYS) localStorage.removeItem(key);
  },
  clear: () => {
    localStorage.removeItem(LOGIN_STORAGE_KEY);
    for (const key of LEGACY_LOGIN_KEYS) localStorage.removeItem(key);
  },
};

const tagsFor = (login: StoredLogin): SignerTags =>
  login.method === "nip07" ? nip07Tags() : nip46Tags(login.session.relays);

// モバイルの Safari では、アプリを開き直した直後などに拡張機能が立ち上がり直すため、注入が 1 秒を超えて遅れる。
const NIP07_RESTORE_WAIT_MS = 5_000;
// 注入された後も、スマホの拡張機能は公開鍵を返さないまま止まることがある。
const NIP07_RESPONSE_WAIT_MS = 10_000;

const NIP07_NO_RESPONSE =
  "拡張機能から応答がありません。拡張機能がこのサイトで許可されているか確かめてください。使えるようになれば、そのままログインします。";

export const createSession = (
  pool: ConnectionPool,
  options: { nostrConnectRelays?: readonly RelayUrl[] } = {},
) => {
  const [state, setState] = createStore(initialLoginState());
  const dispatch = (event: LoginEvent) =>
    setState(reconcile(reduceLogin(state, event)));
  const [authUrl, setAuthUrl] = createSignal<URL>();
  const signerWait = createSignerWait();
  const signer = observeSigner(createActiveSigner(), signerWait);
  let connection: LoginConnection | undefined;
  onCleanup(() => connection?.close());
  // 復元を始め直したら、前の試みから遅れて届いた返事を当てない。
  let restoreAttempt = 0;
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
    waitMessage: string,
    immediate = false,
  ) => {
    if (state.pending) return;
    stopNip07Watch();
    dispatch({ type: "task-started" });
    setAuthUrl(undefined);
    try {
      await signerWait.track(waitMessage, task, immediate ? 0 : undefined);
    } finally {
      dispatch({ type: "task-finished" });
    }
  };

  const activate = (next: LoginConnection) => {
    stopNip07Watch();
    restoreAttempt++;
    if (connection !== next) connection?.close();
    connection = next;
    const resetAuth = needsAuthReset(state, next.pubkey);
    signer.set(reportSignerFailures(next.signer, tagsFor(next.stored)));
    if (resetAuth) pool.resetAuthentication();
    setAuthUrl(undefined);
    dispatch({ type: "connected", pubkey: next.pubkey });
    storedLogin.write(next.stored);
  };

  const restoreFailedWith = (message: string) => {
    if (state.pubkey) signer.disconnect();
    else signer.set(undefined);
    dispatch({ type: "restore-failed", message });
  };

  const loginWithExtension = () =>
    run(
      async () => {
        try {
          activate(await connectNip07());
        } catch (e) {
          reportSignerError(e, "login", nip07Tags());
          dispatch({
            type: "failed",
            message:
              e instanceof SignerUnavailableError
                ? "NIP-07 対応の拡張機能が見つかりません。"
                : `ログインに失敗しました: ${errorText(e)}`,
          });
        }
      },
      "ログインを待っています",
      true,
    );

  const loginWithBunker = (uri: string) =>
    run(
      async () => {
        let bunker: BunkerConnection;
        try {
          bunker = parseBunkerUri(uri);
        } catch (e) {
          dispatch({
            type: "failed",
            message: `リモート署名器に接続できませんでした: ${errorText(e)}`,
          });
          return;
        }
        const hidden = watchHidden();
        try {
          activate(
            nip46Connection(
              await connectNip46({
                pool,
                bunker,
                hooks,
                metadataUrl: location.origin,
              }),
            ),
          );
        } catch (e) {
          reportSignerError(e, "login:bunker", {
            ...nip46Tags(bunker.relays),
            ...hidden(),
          });
          dispatch({
            type: "failed",
            message: `リモート署名器に接続できませんでした: ${errorText(e)}`,
          });
        }
      },
      "ログインを待っています",
      true,
    );

  const loginWithNostrConnect = (): ConnectAttempt => {
    const resume = loadNostrConnectAttempt(pendingAttempt.read(), Date.now());
    const hidden = watchHidden();
    const attempt = startNostrConnect({
      pool,
      relays: options.nostrConnectRelays,
      resume,
      metadata: { name: "Streets", url: location.origin },
      hooks,
    });
    pendingAttempt.write(saveNostrConnectAttempt(attempt.stored));
    const done = attempt.session.then(
      (session) => {
        pendingAttempt.clear();
        activate(nip46Connection(session));
      },
      (e) => {
        pendingAttempt.clear();
        if (e instanceof NostrConnectCancelledError) {
          throw new ConnectCancelledError();
        }
        reportSignerError(e, "login:nostrconnect", {
          ...nip46Tags(attempt.stored.relays),
          ...hidden(),
          "nostrconnect.resumed": resume ? "yes" : "no",
        });
        throw e;
      },
    );
    return {
      uri: attempt.uri,
      resumed: resume !== undefined,
      done,
      cancel: () => {
        pendingAttempt.clear();
        attempt.cancel();
      },
    };
  };

  const restoreWith = (login: StoredLogin, attempt: number) => {
    // 覚えていた人の画面を先に出し、署名器が戻るまで署名を待たせる。
    dispatch({ type: "restore-started", pubkey: storedLoginPubkey(login) });
    if (state.pubkey) signer.expect();

    if (login.method === "nip07") {
      void run(async () => {
        try {
          activate(
            await restoreNip07({
              injectWaitMs: NIP07_RESTORE_WAIT_MS,
              answerWaitMs: NIP07_RESPONSE_WAIT_MS,
            }),
          );
        } catch (e) {
          if (!(e instanceof Nip07NotReadyError)) {
            reportSignerError(e, "restore", nip07Tags());
            restoreFailedWith(`ログインの復元に失敗しました: ${errorText(e)}`);
            return;
          }
          // まだ立ち上がっていないだけのこともあるので、無いとは言い切らない。
          restoreFailedWith(NIP07_NO_RESPONSE);
          if (e.reason === "not-injected") {
            stopWatchingNip07 = watchForNip07(restore);
          }
          // 待つのをやめても、拡張機能が遅れて返してくれたらそのまま使う。
          e.late?.then(
            (late) => {
              if (attempt === restoreAttempt) activate(late);
            },
            () => {},
          );
        }
      }, "ログインの復元を待っています");
      return;
    }

    void run(async () => {
      const hidden = watchHidden();
      try {
        activate(
          nip46Connection(
            await restoreNip46({ pool, stored: login.session, hooks }),
          ),
        );
      } catch (e) {
        reportSignerError(e, "restore", {
          ...nip46Tags(login.session.relays),
          ...hidden(),
        });
        restoreFailedWith(
          "署名器と繋がりませんでした。署名器のアプリが動いているか確かめて、もう一度試してください。",
        );
      }
    }, "ログインの復元を待っています");
  };

  const restore = () => {
    if (state.pending) return;
    const attempt = ++restoreAttempt;
    const loaded = loadStoredLogin(localStorage);
    switch (loaded.type) {
      case "none":
        return;
      case "unreadable":
        storedLogin.clear();
        dispatch({
          type: "failed",
          message:
            "保存していたログインを読めませんでした。もう一度ログインしてください。",
        });
        return;
      case "login":
        if (loaded.legacy) storedLogin.write(loaded.login);
        restoreWith(loaded.login, attempt);
    }
  };

  // 署名器のアプリへ切り替えて戻ってきたら、押させずに繋ぎ直す。
  // 裏にいる間に切れたソケットは再接続を最大 60 秒遅らせるので、待たずに張り直す。
  const retryOnReturn = () => {
    if (document.hidden) return;
    const disconnected = state.status === "disconnected";
    if (connection?.stored.method === "nip46" || disconnected) {
      pool.retryNow();
    }
    if (disconnected) restore();
  };
  document.addEventListener("visibilitychange", retryOnReturn);
  onCleanup(() =>
    document.removeEventListener("visibilitychange", retryOnReturn),
  );

  const logout = () => {
    stopNip07Watch();
    restoreAttempt++;
    const previous = connection;
    connection = undefined;
    const resetAuth = needsAuthReset(state, undefined);
    signer.set(undefined);
    if (resetAuth) pool.resetAuthentication();
    setAuthUrl(undefined);
    dispatch({ type: "logged-out" });
    storedLogin.clear();
    void previous?.logout();
  };

  return {
    pubkey: () => state.pubkey,
    signerStatus: () => state.status,
    pending: () => state.pending,
    error: () => state.error,
    authUrl,
    signer,
    signerWaits: signerWait.messages,
    loginWithExtension,
    loginWithBunker,
    loginWithNostrConnect,
    restore,
    restoreFailed: () => state.restoreFailed,
    logout,
  };
};

export type Session = ReturnType<typeof createSession>;
