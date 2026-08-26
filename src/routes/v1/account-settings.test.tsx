import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { Mutation } from "../../core/nostr/build/draft";
import type { NostrEvent } from "../../core/nostr/event";
import type { ReplaceableChange } from "../../core/read/event-store";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { createAccountSettings } from "./account-settings";

const PUBKEY = "f".repeat(64);

const event = (tags: string[][]): NostrEvent => ({
  id: "a".repeat(64),
  pubkey: PUBKEY,
  created_at: 1,
  kind: 10002,
  tags,
  content: "",
  sig: "b".repeat(128),
});

const setup = (initial?: NostrEvent) => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [settled, setSettled] = createSignal(false);
  let current = initial;
  const listeners = new Set<(change: ReplaceableChange) => void>();
  const replace = vi.fn(
    async (
      _kind: number,
      _identifier: string | undefined,
      _mutation: Mutation,
    ) => ({
      event: event([]),
      accepted: ["wss://one/" as RelayUrl],
      rejected: [],
    }),
  );
  const settings = createAccountSettings({
    pubkey,
    relayListSettled: settled,
    store: {
      latestReplaceable: () => current,
      onReplaceableChanged(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    writer: { replace },
  });
  return {
    settings,
    setPubkey,
    setSettled,
    replace,
    receive(next: NostrEvent) {
      current = next;
      for (const listener of listeners) {
        listener({ kind: 10002, pubkey: PUBKEY });
      }
    },
  };
};

describe("アカウント設定", () => {
  it("未ログイン・取得中・欠落・取得済みを区別する", () => {
    createRoot((dispose) => {
      // 捕まえる変異: loading と missing を同じ空配列へ潰す。
      const { settings, setPubkey, setSettled, receive } = setup();
      expect(settings.relayList.current().phase).toBe("signed-out");
      setPubkey(PUBKEY);
      expect(settings.relayList.current().phase).toBe("loading");
      setSettled(true);
      expect(settings.relayList.current().phase).toBe("missing");
      receive(event([["r", "wss://one", "read"]]));
      expect(settings.relayList.current()).toEqual({
        phase: "ready",
        entries: [{ url: "wss://one/", read: true, write: false }],
      });
      dispose();
    });
  });

  it("URL を正規化して重複を追加しない", () => {
    createRoot((dispose) => {
      // 捕まえる変異: 生文字列のまま比較し末尾スラッシュ違いを二重登録する。
      const { settings } = setup();
      expect(settings.relayList.add("wss://Relay.Example")).toBe(true);
      expect(settings.relayList.add("wss://relay.example/")).toBe(false);
      expect(settings.relayList.draft()).toEqual([
        { url: "wss://relay.example/", read: true, write: true },
      ]);
      dispose();
    });
  });

  it("最後の方向は無効にせず削除操作を要求する", () => {
    createRoot((dispose) => {
      // 捕まえる変異: read と write の両方を false にして、保存時に行が
      // 黙って消える状態を作る。
      const { settings } = setup();
      settings.relayList.add("wss://one/");
      settings.relayList.toggle("wss://one/", "write");
      settings.relayList.toggle("wss://one/", "read");
      expect(settings.relayList.draft()).toEqual([
        { url: "wss://one/", read: true, write: false },
      ]);
      expect(settings.relayList.error()).toContain("少なくとも一方");
      dispose();
    });
  });

  it("dirty でなければ受信した新版へ追随し、編集中なら draft を守る", () => {
    createRoot((dispose) => {
      // 捕まえる変異: 外から kind:10002 が届くたびに編集中の draft を上書きする。
      const { settings, setPubkey, setSettled, receive } = setup();
      setPubkey(PUBKEY);
      setSettled(true);
      receive(event([["r", "wss://one/"]]));
      expect(settings.relayList.draft()[0]?.url).toBe("wss://one/");

      settings.relayList.add("wss://local/");
      receive(event([["r", "wss://remote/"]]));

      expect(settings.relayList.current()).toMatchObject({
        phase: "ready",
        entries: [{ url: "wss://remote/" }],
      });
      expect(settings.relayList.draft().map((entry) => entry.url)).toEqual([
        "wss://one/",
        "wss://local/",
      ]);
      dispose();
    });
  });

  it("draft を kind:10002 の Mutation として保存する", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: Writer.replace へ別 kind または空の Mutation を渡す。
            const { settings, setPubkey, setSettled, replace } = setup();
            setPubkey(PUBKEY);
            setSettled(true);
            settings.relayList.add("wss://one/");

            await settings.relayList.save();

            expect(replace).toHaveBeenCalledTimes(1);
            const [kind, identifier, mutation] = replace.mock.calls[0];
            expect(kind).toBe(10002);
            expect(identifier).toBeUndefined();
            expect(mutation(undefined)).toEqual({
              kind: 10002,
              tags: [["r", "wss://one/"]],
              content: "",
            });
            expect(settings.relayList.dirty()).toBe(false);
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

  it("保存に失敗したら draft を残して再試行できる", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: Writer.replace の失敗でも dirty を false にし、
            // 入力を保存済みと見せて再試行ボタンを無効にする。
            const { settings, setPubkey, setSettled, replace } = setup();
            setPubkey(PUBKEY);
            setSettled(true);
            settings.relayList.add("wss://one/");
            replace.mockRejectedValueOnce(new Error("relay rejected"));

            await settings.relayList.save();

            expect(settings.relayList.dirty()).toBe(true);
            expect(settings.relayList.draft()).toHaveLength(1);
            expect(settings.relayList.error()).toContain("relay rejected");
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
