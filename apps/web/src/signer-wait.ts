import type { ActiveSigner } from "@streets/core/signer/active-signer";
import { signingWaitMessage } from "@streets/core/view/signer-wait";
import { createSignal, onCleanup } from "solid-js";

const WAIT_DELAY_MS = 2500;

type PendingWait = {
  message: string;
  shown: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

/** 同時に複数の承認が走っても、表示中のものを消してしまわない。 */
export const createSignerWait = () => {
  const [message, setMessage] = createSignal<string>();
  const pending = new Map<number, PendingWait>();
  let nextId = 0;
  const refresh = () => {
    setMessage([...pending.values()].find((entry) => entry.shown)?.message);
  };

  const track = async <T>(
    text: string,
    task: () => Promise<T>,
    delayMs = WAIT_DELAY_MS,
  ): Promise<T> => {
    const id = nextId++;
    const entry: PendingWait = { message: text, shown: delayMs === 0 };
    pending.set(id, entry);
    if (entry.shown) refresh();
    else {
      entry.timer = setTimeout(() => {
        entry.shown = true;
        refresh();
      }, delayMs);
    }
    try {
      return await task();
    } finally {
      clearTimeout(entry.timer);
      pending.delete(id);
      refresh();
    }
  };

  onCleanup(() => {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
  });

  return { message, track };
};

/** 実際に外部の署名器へ依頼する期間だけを監視する。能力の有無は元の署名器に従う。 */
export const observeSigner = (
  signer: ActiveSigner,
  wait: ReturnType<typeof createSignerWait>,
): ActiveSigner => ({
  set: (next) => signer.set(next),
  getPublicKey: () => signer.getPublicKey(),
  signEvent: (template) =>
    wait.track(signingWaitMessage(template.kind), () =>
      signer.signEvent(template),
    ),
  get nip44() {
    const nip44 = signer.nip44;
    return nip44
      ? {
          encrypt: (peerPubkey: string, plaintext: string) =>
            wait.track("非公開の情報の暗号化を待っています", () =>
              nip44.encrypt(peerPubkey, plaintext),
            ),
          decrypt: (peerPubkey: string, ciphertext: string) =>
            wait.track("非公開の情報の読み取りを待っています", () =>
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
            wait.track("非公開の情報の読み取りを待っています", () =>
              nip04.decrypt(peerPubkey, ciphertext),
            ),
        }
      : undefined;
  },
});
