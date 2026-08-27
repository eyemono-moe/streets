import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "../../core/nostr/event";
import type { ReplaceableChange } from "../../core/read/event-store";
import type { RelayUrl } from "../../core/relay/relay-connection";
import type { Signer } from "../../core/signer/signer";
import type { Replacement, WriteResult } from "../../core/write/writer";
import { createMuteList } from "./mute-list";

const PUBKEY = "a".repeat(64);

const asEvent = (
  draft: { kind: number; tags: string[][]; content: string },
  createdAt = 1,
): NostrEvent => ({
  ...draft,
  id: `${createdAt}`.padStart(64, "b"),
  pubkey: PUBKEY,
  created_at: createdAt,
  sig: "c".repeat(128),
});

const signer: Signer = {
  getPublicKey: async () => PUBKEY,
  signEvent: async (draft) => ({
    ...draft,
    id: "d".repeat(64),
    sig: "e".repeat(128),
  }),
  nip44: {
    encrypt: async (_peer, plaintext) => `44:${plaintext}`,
    decrypt: async (_peer, ciphertext) => ciphertext.replace(/^44:/, ""),
  },
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("MuteList", () => {
  it("NIP-65 の経路が確定するまでリスト取得を始めない", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: routingSettled を待たず fallback relay だけで missing を確定する。
            const [routingSettled, setRoutingSettled] = createSignal(false);
            const fetchLatest = vi.fn(async () => undefined);
            const muteList = createMuteList({
              pubkey: () => PUBKEY,
              routingSettled,
              signer,
              store: {
                latestReplaceable: () => undefined,
                onReplaceableChanged: () => () => {},
              },
              writer: { replace: vi.fn() },
              fetchLatest,
            });
            await flush();
            expect(muteList.state().phase).toBe("loading");
            expect(fetchLatest).not.toHaveBeenCalled();

            setRoutingSettled(true);
            await flush();
            expect(fetchLatest).toHaveBeenCalledWith(10_000, undefined, PUBKEY);
            expect(muteList.state().phase).toBe("missing");
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });

  it("未ログイン・取得中・欠落を区別し、ログアウトで項目を破棄する", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: ログアウト後も直前アカウントの復号済み entries を残す。
            const [pubkey, setPubkey] = createSignal<string>();
            let finishFetch: (value: undefined) => void = () => {};
            const muteList = createMuteList({
              pubkey,
              routingSettled: () => true,
              signer,
              store: {
                latestReplaceable: () => undefined,
                onReplaceableChanged: () => () => {},
              },
              writer: { replace: vi.fn() },
              fetchLatest: () =>
                new Promise<undefined>((finish) => {
                  finishFetch = finish;
                }),
            });
            expect(muteList.state().phase).toBe("signed-out");
            setPubkey(PUBKEY);
            await flush();
            expect(muteList.state().phase).toBe("loading");
            finishFetch(undefined);
            await flush();
            expect(muteList.state()).toMatchObject({
              phase: "missing",
              entries: [],
            });
            setPubkey(undefined);
            expect(muteList.state().phase).toBe("signed-out");
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });

  it("連続した保存を直列化し、前の版を次の mutation へ渡す", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: queue を使わず、2件とも undefined から更新して片方を失う。
            const [pubkey] = createSignal<string | undefined>(PUBKEY);
            let current: NostrEvent | undefined;
            let createdAt = 0;
            const listeners = new Set<(change: ReplaceableChange) => void>();
            const replace = vi.fn(
              async (
                _kind: number,
                _identifier: string | undefined,
                mutation: Replacement,
              ): Promise<WriteResult> => {
                const draft = await mutation(current);
                current = asEvent(draft, ++createdAt);
                for (const listener of listeners) {
                  listener({ kind: 10_000, pubkey: PUBKEY });
                }
                return {
                  event: current,
                  accepted: ["wss://relay/" as RelayUrl],
                  rejected: [],
                };
              },
            );
            const muteList = createMuteList({
              pubkey,
              routingSettled: () => true,
              signer,
              store: {
                latestReplaceable: () => current,
                onReplaceableChanged(listener) {
                  listeners.add(listener);
                  return () => listeners.delete(listener);
                },
              },
              writer: { replace },
              fetchLatest: async () => current,
            });
            await flush();

            await Promise.all([
              muteList.add({ type: "word", value: "one" }, "private"),
              muteList.add({ type: "word", value: "two" }, "private"),
            ]);
            await flush();

            expect(replace).toHaveBeenCalledTimes(2);
            expect(current?.content).toBe('44:[["word","one"],["word","two"]]');
            expect(muteList.state()).toMatchObject({
              phase: "ready",
              entries: [
                {
                  target: { type: "word", value: "one" },
                  visibility: "private",
                },
                {
                  target: { type: "word", value: "two" },
                  visibility: "private",
                },
              ],
            });
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });

  it("待機中の保存を次のアカウントへ適用しない", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: キュー実行時の pubkey を読み、A の2件目を B へ保存する。
            const [pubkey, setPubkey] = createSignal<string | undefined>(
              PUBKEY,
            );
            let releaseFirst = () => {};
            const firstGate = new Promise<void>((finish) => {
              releaseFirst = finish;
            });
            let markStarted = () => {};
            const firstStarted = new Promise<void>((finish) => {
              markStarted = finish;
            });
            const replace = vi.fn(async (): Promise<WriteResult> => {
              markStarted();
              await firstGate;
              return {
                event: asEvent({ kind: 10_000, tags: [], content: "" }),
                accepted: ["wss://relay/" as RelayUrl],
                rejected: [],
              };
            });
            const muteList = createMuteList({
              pubkey,
              routingSettled: () => true,
              signer,
              store: {
                latestReplaceable: () => undefined,
                onReplaceableChanged: () => () => {},
              },
              writer: { replace },
              fetchLatest: async () => undefined,
            });
            await flush();

            const first = muteList.add(
              { type: "word", value: "for-a-first" },
              "private",
            );
            await firstStarted;
            const second = muteList
              .add({ type: "word", value: "for-a-second" }, "private")
              .catch((error: unknown) => error);
            setPubkey("b".repeat(64));
            await flush();
            releaseFirst();
            await first;

            expect(await second).toMatchObject({
              message: "ミュートの保存中にアカウントが切り替わりました",
            });
            expect(replace).toHaveBeenCalledTimes(1);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  });
});
