import type { NostrEvent, UnsignedEvent } from "../nostr/event";
import {
  type Signer,
  SignerDisconnectedError,
  SignerUnavailableError,
} from "./signer";

export type ActiveSigner = Signer & {
  set(signer: Signer | undefined): void;
  /**
   * 保存したログインを戻している。戻るまで、署名も復号も待たせる。
   * 戻す間もアカウントの画面を出しておくため、署名器なしとは分ける。
   */
  expect(): void;
  /**
   * 戻せなかったが、ログインは消していない。押した操作の署名はすぐ断り、
   * 裏の復号は署名器が戻るまで待たせる（失敗にすると、読めない非公開の項目が
   * 壊れているように見え、繋ぎ直しても読み直されない）。
   */
  disconnect(): void;
  /** 署名器が使えるようになるまで待つ。ログアウトしていれば断る。 */
  connected(): Promise<void>;
};

type State =
  | { type: "none" }
  | { type: "ready"; signer: Signer }
  | { type: "connecting" }
  | { type: "disconnected" };

type Waiter = {
  /** 繋がっていないと分かった時点で断る（押した操作）か、戻るまで待つ（裏の読み取り）か。 */
  urgent: boolean;
  resolve: (signer: Signer) => void;
  reject: (error: unknown) => void;
};

/**
 * `Writer` から見える署名器を、ログイン方式と同時に切り替える。開始時に
 * だけ現在値を読むので、進行中の署名要求は差し替わらず次の操作から新 session。
 */
export const createActiveSigner = (): ActiveSigner => {
  let state: State = { type: "none" };
  let waiters: Waiter[] = [];

  const settle = (
    pick: (waiter: Waiter) => boolean,
    run: (waiter: Waiter) => void,
  ) => {
    const picked = waiters.filter(pick);
    waiters = waiters.filter((waiter) => !pick(waiter));
    for (const waiter of picked) run(waiter);
  };

  const current = (urgent: boolean): Promise<Signer> => {
    switch (state.type) {
      case "ready":
        return Promise.resolve(state.signer);
      case "none":
        return Promise.reject(new SignerUnavailableError("no active signer"));
      case "disconnected":
        if (urgent) {
          return Promise.reject(new SignerDisconnectedError());
        }
        break;
      case "connecting":
        break;
    }
    return new Promise((resolve, reject) => {
      waiters.push({ urgent, resolve, reject });
    });
  };

  const missingNip44 = () => new SignerUnavailableError("signer has no NIP-44");
  const missingNip04 = () => new SignerUnavailableError("signer has no NIP-04");

  return {
    set(signer) {
      if (signer) {
        state = { type: "ready", signer };
        settle(
          () => true,
          (waiter) => waiter.resolve(signer),
        );
      } else {
        state = { type: "none" };
        settle(
          () => true,
          (waiter) =>
            waiter.reject(new SignerUnavailableError("no active signer")),
        );
      }
    },
    expect() {
      state = { type: "connecting" };
    },
    disconnect() {
      state = { type: "disconnected" };
      settle(
        (waiter) => waiter.urgent,
        (waiter) => waiter.reject(new SignerDisconnectedError()),
      );
    },
    async connected() {
      await current(false);
    },
    async getPublicKey(): Promise<string> {
      return (await current(true)).getPublicKey();
    },
    async signEvent(template: UnsignedEvent): Promise<NostrEvent> {
      return (await current(true)).signEvent(template);
    },
    // 戻る前は署名器の能力が分からない。ほとんどの署名器は NIP-44 を持つので、
    // 持つものとして待たせ、戻ってから無いと分かったら断る。
    get nip44() {
      if (state.type === "none") return undefined;
      if (state.type === "ready" && !state.signer.nip44) return undefined;
      return {
        encrypt: async (peerPubkey: string, plaintext: string) => {
          const nip44 = (await current(true)).nip44;
          if (!nip44) throw missingNip44();
          return nip44.encrypt(peerPubkey, plaintext);
        },
        decrypt: async (peerPubkey: string, ciphertext: string) => {
          const nip44 = (await current(false)).nip44;
          if (!nip44) throw missingNip44();
          return nip44.decrypt(peerPubkey, ciphertext);
        },
      };
    },
    get nip04() {
      if (state.type === "none") return undefined;
      if (state.type === "ready" && !state.signer.nip04) return undefined;
      return {
        decrypt: async (peerPubkey: string, ciphertext: string) => {
          const nip04 = (await current(false)).nip04;
          if (!nip04) throw missingNip04();
          return nip04.decrypt(peerPubkey, ciphertext);
        },
      };
    },
  };
};
