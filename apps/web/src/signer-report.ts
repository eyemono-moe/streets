import {
  type Signer,
  SignerUnavailableError,
} from "@streets/core/signer/signer";
import { reportError } from "./telemetry";

export type SignerTags = Record<string, string>;

/**
 * NIP-07 には拡張機能の名前を返す決まりが無い。`window.nostr` に生やしている
 * 名前の並び（`_call` や `_requests` など、実装ごとに違う）で見分ける。
 */
export const nip07Tags = (): SignerTags => {
  const api = (globalThis as { nostr?: object }).nostr;
  return {
    "signer.method": "nip07",
    "nip07.shape": api ? Object.keys(api).sort().join(",") : "none",
  };
};

/** NIP-46 は、繋いでいるリレーで署名器のアプリの見当が付く（nsec.app など）。 */
export const nip46Tags = (relays: readonly string[]): SignerTags => ({
  "signer.method": "nip46",
  "nip46.relays": relays
    .map((relay) => {
      try {
        return new URL(relay).host;
      } catch {
        return "?";
      }
    })
    .sort()
    .join(","),
});

// 裏の復号は非公開の項目ごとに呼ばれ、壊れた署名器では同じ失敗が何十回も出る。
// 読み込み 1 回につき、同じ失敗は 1 回だけ送る。
const sent = new Set<string>();

/**
 * 署名器の失敗を、どの署名器で起きたか分かる形で送る。失敗の多くは拡張機能や
 * 署名器のアプリ側の不具合で、トーストに出すだけでは報告を待つしかない。
 */
export const reportSignerError = (
  error: unknown,
  op: string,
  tags: SignerTags,
) => {
  // 署名器が無い・繋がっていないのは、こちらが知っていて画面にも出している。
  if (error instanceof SignerUnavailableError) return;
  const message = error instanceof Error ? error.message : String(error);
  const key = `${tags["signer.method"]}\n${op}\n${message}`;
  if (sent.has(key)) return;
  sent.add(key);
  reportError(error, "signer", { ...tags, "signer.op": op });
};

const watch = async <T>(
  op: string,
  tags: SignerTags,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    reportSignerError(error, op, tags);
    throw error;
  }
};

/**
 * 署名器の失敗を送る。能力の有無（`nip44` が無いなど）は元の署名器に従うので、
 * `nip44`・`nip04` は読まれるたびに元を読む。
 */
export const reportSignerFailures = (
  signer: Signer,
  tags: SignerTags,
): Signer => ({
  getPublicKey: () =>
    watch("get_public_key", tags, () => signer.getPublicKey()),
  signEvent: (template) =>
    watch(`sign_event:${template.kind}`, tags, () =>
      signer.signEvent(template),
    ),
  get nip44() {
    const nip44 = signer.nip44;
    return nip44
      ? {
          encrypt: (peerPubkey: string, plaintext: string) =>
            watch("nip44_encrypt", tags, () =>
              nip44.encrypt(peerPubkey, plaintext),
            ),
          decrypt: (peerPubkey: string, ciphertext: string) =>
            watch("nip44_decrypt", tags, () =>
              nip44.decrypt(peerPubkey, ciphertext),
            ),
        }
      : undefined;
  },
  get nip04() {
    const nip04 = signer.nip04;
    return nip04
      ? {
          decrypt: (peerPubkey: string, ciphertext: string) =>
            watch("nip04_decrypt", tags, () =>
              nip04.decrypt(peerPubkey, ciphertext),
            ),
        }
      : undefined;
  },
});
