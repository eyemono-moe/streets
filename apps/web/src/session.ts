import type { ConnectionPool } from "@streets/core/read/connection-pool";
import { createActiveSigner } from "@streets/core/signer/active-signer";
import {
  createNip07Signer,
  waitForNip07,
} from "@streets/core/signer/nip07-signer";
import { parseBunkerUri } from "@streets/core/signer/nip46/bunker-uri";
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
  loadLoginMethod,
  saveLoginMethod,
} from "@streets/core/signer/session-storage";
import { SignerUnavailableError } from "@streets/core/signer/signer";
import { createSignal, onCleanup } from "solid-js";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export type SessionState = "loading" | "signed-out" | "signed-in";

export const createSession = (pool: ConnectionPool) => {
  const [state, setState] = createSignal<SessionState>("loading");
  const [pubkey, setPubkey] = createSignal<string>();
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [authUrl, setAuthUrl] = createSignal<URL>();
  const signer = createActiveSigner();
  let nip46: Nip46Session | undefined;
  onCleanup(() => nip46?.client.close());

  const hooks = { onAuthUrl: (url: URL | undefined) => setAuthUrl(url) };

  const run = async (task: () => Promise<void>) => {
    setPending(true);
    setError(undefined);
    try {
      await task();
    } finally {
      setPending(false);
    }
  };

  const activateNip46 = (session: Nip46Session) => {
    nip46?.client.close();
    nip46 = session;
    signer.set(session.signer);
    setAuthUrl(undefined);
    setPubkey(session.userPubkey);
    setState("signed-in");
    localStorage.setItem(
      NIP46_SESSION_STORAGE_KEY,
      saveNip46Session(session.stored),
    );
    localStorage.setItem(LOGIN_METHOD_STORAGE_KEY, saveLoginMethod("nip46"));
  };

  const loginWithExtension = () =>
    run(async () => {
      try {
        const extension = createNip07Signer();
        const pk = await extension.getPublicKey();
        nip46?.client.close();
        nip46 = undefined;
        localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
        localStorage.setItem(
          LOGIN_METHOD_STORAGE_KEY,
          saveLoginMethod("nip07"),
        );
        signer.set(extension);
        setPubkey(pk);
        setState("signed-in");
      } catch (e) {
        setState("signed-out");
        setError(
          e instanceof SignerUnavailableError
            ? "NIP-07 対応の拡張機能が見つかりません。"
            : `ログインに失敗しました: ${errorText(e)}`,
        );
      }
    });

  const loginWithBunker = (uri: string) =>
    run(async () => {
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
        setState("signed-out");
        setError(`リモート署名器に接続できませんでした: ${errorText(e)}`);
      }
    });

  const restore = () => {
    const methodRaw = localStorage.getItem(LOGIN_METHOD_STORAGE_KEY);
    const method = loadLoginMethod(methodRaw);
    if (methodRaw !== null && method === undefined) {
      localStorage.removeItem(LOGIN_METHOD_STORAGE_KEY);
    }
    if (method === "nip07") {
      void run(async () => {
        if (!(await waitForNip07())) {
          setState("signed-out");
          setError("NIP-07 対応の拡張機能が見つかりません。");
          return;
        }
        try {
          const extension = createNip07Signer();
          const pk = await extension.getPublicKey();
          signer.set(extension);
          setPubkey(pk);
          setState("signed-in");
        } catch (e) {
          setState("signed-out");
          setError(`ログインの復元に失敗しました: ${errorText(e)}`);
        }
      });
      return;
    }

    const raw = localStorage.getItem(NIP46_SESSION_STORAGE_KEY);
    // login-method 導入前に保存された NIP-46 セッションも引き続き復元する。
    if (method !== "nip46" && raw === null) {
      setState("signed-out");
      return;
    }
    const stored = loadNip46Session(raw);
    if (!stored) {
      // 必要な権限が増えると古い保存形式は読めなくなり、再接続でしか承認し直せない。
      localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
      localStorage.removeItem(LOGIN_METHOD_STORAGE_KEY);
      setState("signed-out");
      setError(
        "署名器の権限が更新されました。bunker URI で再接続してください。",
      );
      return;
    }
    void run(async () => {
      try {
        activateNip46(await restoreNip46({ pool, stored, hooks }));
      } catch {
        setState("signed-out");
        setError(
          "署名器との接続を復元できませんでした。接続を確認して再読み込みするか、bunker URI で再接続してください。",
        );
      }
    });
  };

  const logout = () => {
    const session = nip46;
    nip46 = undefined;
    signer.set(undefined);
    setPubkey(undefined);
    setState("signed-out");
    setAuthUrl(undefined);
    localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
    localStorage.removeItem(LOGIN_METHOD_STORAGE_KEY);
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
    state,
    pubkey,
    pending,
    error,
    authUrl,
    signer,
    loginWithExtension,
    loginWithBunker,
    restore,
    logout,
  };
};

export type Session = ReturnType<typeof createSession>;
