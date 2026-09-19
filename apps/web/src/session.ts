import type { ConnectionPool } from "@streets/core/read/connection-pool";
import { createActiveSigner } from "@streets/core/signer/active-signer";
import { createNip07Signer } from "@streets/core/signer/nip07-signer";
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
import { SignerUnavailableError } from "@streets/core/signer/signer";
import { createSignal, onCleanup } from "solid-js";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const createSession = (pool: ConnectionPool) => {
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
    localStorage.setItem(
      NIP46_SESSION_STORAGE_KEY,
      saveNip46Session(session.stored),
    );
  };

  const loginWithExtension = () =>
    run(async () => {
      try {
        const extension = createNip07Signer();
        const pk = await extension.getPublicKey();
        nip46?.client.close();
        nip46 = undefined;
        localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
        signer.set(extension);
        setPubkey(pk);
      } catch (e) {
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
        setError(`リモート署名器に接続できませんでした: ${errorText(e)}`);
      }
    });

  const restore = () => {
    const raw = localStorage.getItem(NIP46_SESSION_STORAGE_KEY);
    if (raw === null) return;
    const stored = loadNip46Session(raw);
    if (!stored) {
      // 必要な権限が増えると古い保存形式は読めなくなり、再接続でしか承認し直せない。
      localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
      setError(
        "署名器の権限が更新されました。bunker URI で再接続してください。",
      );
      return;
    }
    void run(async () => {
      try {
        activateNip46(await restoreNip46({ pool, stored, hooks }));
      } catch {
        localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
        setError("署名器との接続を復元できませんでした。再接続してください。");
      }
    });
  };

  const logout = () => {
    const session = nip46;
    nip46 = undefined;
    signer.set(undefined);
    setPubkey(undefined);
    setAuthUrl(undefined);
    localStorage.removeItem(NIP46_SESSION_STORAGE_KEY);
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
