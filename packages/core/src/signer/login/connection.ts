import {
  createNip07Signer,
  isNip07Available,
  waitForNip07,
} from "../nip07-signer";
import type { Nip46Session } from "../nip46/session";
import type { NosskeyClient } from "../nosskey/nosskey-client";
import { createNosskeySigner } from "../nosskey/nosskey-signer";
import type { Signer } from "../signer";
import type { StoredLogin } from "./stored-login";

/** 繋がった署名器。方式によらず、同じ形で使い、保存し、閉じる。 */
export type LoginConnection = {
  signer: Signer;
  pubkey: string;
  stored: StoredLogin;
  /** 別の方式へ替えたときに、手元の通信を閉じる。署名器へは知らせない。 */
  close(): void;
  /** ログアウトを署名器へ知らせてから閉じる。応えない署名器でも閉じる。 */
  logout(): Promise<void>;
};

// logout は署名器への通知にすぎない。応答しない署名器でも接続を閉じられるよう上限を切る。
const NIP46_LOGOUT_WAIT_MS = 5_000;

export const nip07Connection = (
  signer: Signer,
  pubkey: string,
): LoginConnection => ({
  signer,
  pubkey,
  stored: { version: 1, method: "nip07", pubkey },
  close: () => {},
  logout: async () => {},
});

export const nip46Connection = (session: Nip46Session): LoginConnection => ({
  signer: session.signer,
  pubkey: session.userPubkey,
  stored: { version: 1, method: "nip46", session: session.stored },
  close: () => session.client.close(),
  logout: async () => {
    await Promise.race([
      session.client.request("logout"),
      new Promise((resolve) => setTimeout(resolve, NIP46_LOGOUT_WAIT_MS)),
    ]).catch(() => {});
    session.client.close();
  },
});

/** `dispose` は iframe を片付ける。nosskey.app にはログアウトを知らせる手順が無い。 */
export const nosskeyConnection = (
  client: NosskeyClient,
  pubkey: string,
  dispose: () => void,
): LoginConnection => {
  const close = () => {
    client.close();
    dispose();
  };
  return {
    signer: createNosskeySigner(client, pubkey),
    pubkey,
    stored: { version: 1, method: "nosskey", pubkey },
    close,
    logout: async () => close(),
  };
};

export const connectNip07 = async (): Promise<LoginConnection> => {
  const signer = createNip07Signer();
  return nip07Connection(signer, await signer.getPublicKey());
};

/** 拡張機能がまだ使えない。無いとは言い切れない（立ち上がっていない・止まっている）。 */
export class Nip07NotReadyError extends Error {
  constructor(
    readonly reason: "not-injected" | "no-answer",
    /** 待つのをやめた後に拡張機能が答えたら、それで繋がる。 */
    readonly late?: Promise<LoginConnection>,
  ) {
    super(`NIP-07 extension is not ready: ${reason}`);
    this.name = "Nip07NotReadyError";
  }
}

class TimeoutError extends Error {}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });

/**
 * 保存した拡張機能のログインを戻す。注入と返事をそれぞれ待ち、間に合わなければ
 * `Nip07NotReadyError` で知らせる。
 */
export const restoreNip07 = async (options: {
  injectWaitMs: number;
  answerWaitMs: number;
}): Promise<LoginConnection> => {
  if (!isNip07Available() && !(await waitForNip07(options.injectWaitMs))) {
    throw new Nip07NotReadyError("not-injected");
  }
  const signer = createNip07Signer();
  const answer = signer.getPublicKey();
  try {
    return nip07Connection(
      signer,
      await withTimeout(answer, options.answerWaitMs),
    );
  } catch (error) {
    if (!(error instanceof TimeoutError)) throw error;
    const late = answer.then((pubkey) => nip07Connection(signer, pubkey));
    // 遅れた返事を誰も待たなくなっても、拡張機能の失敗を未処理にしない。
    late.catch(() => {});
    throw new Nip07NotReadyError("no-answer", late);
  }
};
