import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import type { Mutation } from "../../core/nostr/build/draft";
import type { NostrEvent } from "../../core/nostr/event";
import type { ReplaceableChange } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { RelayUrl } from "../../core/relay/relay-connection";
import type { WriteResult } from "../../core/write/writer";
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

const profileEvent = (content: string, pubkey = PUBKEY): NostrEvent => ({
  id: "c".repeat(64),
  pubkey,
  created_at: 1,
  kind: 0,
  tags: [],
  content,
  sig: "d".repeat(128),
});

const setup = (initial?: NostrEvent) => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [settled, setSettled] = createSignal(false);
  let current = initial;
  let profile: NostrEvent | undefined;
  const profileFetchedAt = new Map<string, number>();
  const listeners = new Set<(change: ReplaceableChange) => void>();
  const profileListeners = new Set<() => void>();
  const requestedProfiles: string[] = [];
  const replace = vi.fn(
    async (
      _kind: number,
      _identifier: string | undefined,
      _mutation: Mutation,
    ): Promise<WriteResult> => ({
      event: event([]),
      accepted: ["wss://one/" as RelayUrl],
      rejected: [],
    }),
  );
  const settings = createAccountSettings({
    pubkey,
    relayListSettled: settled,
    store: {
      latestReplaceable(kind) {
        return kind === 0 ? profile : current;
      },
      replaceableFetchedAt(kind, author) {
        return kind === 0 ? profileFetchedAt.get(author) : undefined;
      },
      onReplaceableChanged(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    profileRequests: {
      request(author) {
        requestedProfiles.push(author);
      },
      subscribe(listener) {
        profileListeners.add(listener);
        return () => profileListeners.delete(listener);
      },
    } satisfies Pick<ProfileRequests, "request" | "subscribe">,
    writer: { replace },
  });
  return {
    settings,
    setPubkey,
    setSettled,
    replace,
    requestedProfiles,
    settleProfiles() {
      for (const listener of profileListeners) listener();
    },
    markProfileFetched(author = PUBKEY) {
      profileFetchedAt.set(author, 1);
    },
    receive(next: NostrEvent) {
      if (next.kind === 0) {
        profile = next;
        profileFetchedAt.set(next.pubkey, 1);
      } else current = next;
      for (const listener of listeners) {
        listener({ kind: next.kind, pubkey: next.pubkey });
      }
    },
  };
};

describe("アカウント設定", () => {
  it("プロフィール保存は未知フィールドを保持し、部分失敗をthrowする", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: mergeProfileを通さず未知フィールドを落とす、または
            // rejectedを解決扱いにする。
            const { settings, setPubkey, setSettled, receive, replace } =
              setup();
            setPubkey(PUBKEY);
            setSettled(true);
            receive(profileEvent(JSON.stringify({ unknown: "残す" })));
            const values = {
              display_name: "表示名",
              name: "",
              about: "",
              website: "",
              nip05: "",
              picture: "",
              banner: "",
              lightningAddress: "lightning@example.com",
            };
            await settings.profile.save(values);
            const mutation = replace.mock.calls[0]?.[2];
            expect(
              JSON.parse(
                mutation(profileEvent(JSON.stringify({ unknown: "残す" })))
                  .content,
              ),
            ).toMatchObject({
              unknown: "残す",
              display_name: "表示名",
              lud16: "lightning@example.com",
            });
            replace.mockResolvedValueOnce({
              event: profileEvent("{}"),
              accepted: [],
              rejected: [{ relay: "wss://one/" as RelayUrl, reason: "拒否" }],
            });
            await expect(settings.profile.save(values)).rejects.toThrow("1 本");
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

  it("対象の kind:0 を取得し終えるまでプロフィールを loading に保つ", () => {
    createRoot((dispose) => {
      // 捕まえる変異: kind:0 の取得完了を待たず、relayListSettled だけで
      // 空プロフィールを ready にする。
      const {
        settings,
        setPubkey,
        setSettled,
        requestedProfiles,
        settleProfiles,
        markProfileFetched,
      } = setup();
      setPubkey(PUBKEY);
      setSettled(true);

      expect(requestedProfiles).toContain(PUBKEY);
      expect(settings.profile.current().phase).toBe("loading");

      // 別バッチの完了では、対象 pubkey の未取得を完了扱いしない。
      settleProfiles();
      expect(settings.profile.current().phase).toBe("loading");

      markProfileFetched();
      settleProfiles();
      expect(settings.profile.current()).toEqual({
        phase: "ready",
        pubkey: PUBKEY,
        values: {
          display_name: "",
          name: "",
          about: "",
          website: "",
          nip05: "",
          picture: "",
          banner: "",
          lightningAddress: "",
        },
      });
      dispose();
    });
  });

  it("アカウント切替後は旧プロフィールの取得完了で ready にしない", () => {
    createRoot((dispose) => {
      const {
        settings,
        setPubkey,
        setSettled,
        markProfileFetched,
        settleProfiles,
      } = setup();
      const nextPubkey = "e".repeat(64);
      setPubkey(PUBKEY);
      setSettled(true);
      setPubkey(nextPubkey);

      markProfileFetched(PUBKEY);
      settleProfiles();
      expect(settings.profile.current().phase).toBe("loading");

      markProfileFetched(nextPubkey);
      settleProfiles();
      expect(settings.profile.current().phase).toBe("ready");
      dispose();
    });
  });

  /* 旧draft APIのテストはFormischフォームの画面挙動テストへ移した。
  it . skip("kind:0 を初期値にし、入力項目をプロフィールとして保存する", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: `mergeProfile` を使わず、未知フィールドを落とす。
            const { settings, setPubkey, setSettled, receive, replace } =
              setup();
            setPubkey(PUBKEY);
            setSettled(true);
            receive(
              profileEvent(
                JSON.stringify({
                  display_name: "前の表示名",
                  lud06: "old@lightning.example",
                  unknown: "残す",
                }),
              ),
            );

            expect(settings.profile.draft()).toMatchObject({
              display_name: "前の表示名",
              lightningAddress: "old@lightning.example",
            });

            settings.profile.change({
              display_name: "新しい表示名",
              lightningAddress: "new@lightning.example",
            });
            await settings.profile.save();

            const [kind, identifier, mutation] = replace.mock.calls[0];
            expect(kind).toBe(0);
            expect(identifier).toBeUndefined();
            expect(
              JSON.parse(
                mutation(
                  profileEvent(
                    JSON.stringify({
                      unknown: "残す",
                    }),
                  ),
                ).content,
              ),
            ).toEqual({
              unknown: "残す",
              display_name: "新しい表示名",
              name: "",
              about: "",
              website: "",
              nip05: "",
              picture: "",
              banner: "",
              lud16: "new@lightning.example",
            });
            expect(settings.profile.dirty()).toBe(false);
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

  it . skip("プロフィールの reset と部分失敗で draft を正しく保つ", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: rejected があっても dirty を false にする。
            const { settings, setPubkey, setSettled, receive, replace } =
              setup();
            setPubkey(PUBKEY);
            setSettled(true);
            receive(profileEvent(JSON.stringify({ name: "old" })));
            settings.profile.change({ name: "first" });
            settings.profile.reset();
            expect(settings.profile.draft().name).toBe("old");
            expect(settings.profile.dirty()).toBe(false);

            settings.profile.change({ name: "retry" });
            replace.mockResolvedValueOnce({
              event: profileEvent("{}"),
              accepted: ["wss://one/" as RelayUrl],
              rejected: [
                {
                  relay: "wss://old/" as RelayUrl,
                  reason: "temporarily unavailable",
                },
              ],
            });
            await settings.profile.save();

            expect(settings.profile.dirty()).toBe(true);
            expect(settings.profile.draft().name).toBe("retry");
            expect(settings.profile.error()).toContain("1 本");
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

  it . skip("保存中の編集とアカウント切替では旧保存結果を反映しない", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: 保存開始時の revision / pubkey を見ず、新入力または
            // 切替後のアカウントを保存済みにする。
            const { settings, setPubkey, setSettled, receive, replace } =
              setup();
            setPubkey(PUBKEY);
            setSettled(true);
            receive(profileEvent(JSON.stringify({ name: "old" })));
            settings.profile.change({ name: "saved" });
            let finishReplace = () => {};
            replace.mockImplementationOnce(
              () =>
                new Promise((resolveReplace) => {
                  finishReplace = () =>
                    resolveReplace({
                      event: profileEvent("{}"),
                      accepted: ["wss://one/" as RelayUrl],
                      rejected: [],
                    });
                }),
            );

            const saving = settings.profile.save();
            settings.profile.change({ name: "new input" });
            expect(settings.profile.draft().name).toBe("new input");
            finishReplace();
            await saving;
            expect(settings.profile.dirty()).toBe(true);

            settings.profile.change({ name: "old account" });
            const switchedSaving = settings.profile.save();
            setPubkey("e".repeat(64));
            receive(
              profileEvent(
                JSON.stringify({ name: "new account" }),
                "e".repeat(64),
              ),
            );
            await switchedSaving;
            expect(settings.profile.draft().name).toBe("new account");
            expect(settings.profile.dirty()).toBe(false);
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            dispose();
          }
        })();
      });
    });
  }); */

  it("旧アカウントの保存失敗を切替後へ漏らさない", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: save完了時のpubkey照合を外す。AのrejectがBにも
            // throwされ、フォームがBのエラーとして表示してしまう。
            const { settings, setPubkey, setSettled, replace } = setup();
            setPubkey(PUBKEY);
            setSettled(true);
            let finish!: (value: WriteResult) => void;
            replace.mockImplementationOnce(
              () => new Promise<WriteResult>((resolveReplace) => { finish = resolveReplace; }),
            );
            const saving = settings.profile.save({
              display_name: "A", name: "", about: "", website: "", nip05: "", picture: "", banner: "", lightningAddress: "",
            });
            setPubkey("e".repeat(64));
            finish({ event: profileEvent("{}"), accepted: [], rejected: [{ relay: "wss://one/" as RelayUrl, reason: "拒否" }] });
            await expect(saving).resolves.toBeUndefined();
            resolve();
          } catch (error) { reject(error); } finally { dispose(); }
        })();
      });
    });
  });

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

  it("一部リレーへの保存失敗でも dirty を残す", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: accepted が1本あれば rejected を無視して
            // 保存済みにし、旧リレーに旧版が残ったことを隠す。
            const { settings, setPubkey, setSettled, replace } = setup();
            setPubkey(PUBKEY);
            setSettled(true);
            settings.relayList.add("wss://one/");
            replace.mockResolvedValueOnce({
              event: event([]),
              accepted: ["wss://one/" as RelayUrl],
              rejected: [
                {
                  relay: "wss://old/" as RelayUrl,
                  reason: "temporarily unavailable",
                },
              ],
            });

            await settings.relayList.save();

            expect(settings.relayList.dirty()).toBe(true);
            expect(settings.relayList.error()).toContain("1 本");
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

  it("保存中は draft を変更しない", async () => {
    await new Promise<void>((resolve, reject) => {
      createRoot((dispose) => {
        void (async () => {
          try {
            // 捕まえる変異: 保存中も add/toggle/remove を受け付け、送信対象に
            // 入らない編集を成功時の current 同期で消す。
            const { settings, setPubkey, setSettled, replace } = setup();
            setPubkey(PUBKEY);
            setSettled(true);
            settings.relayList.add("wss://one/");
            let finishReplace = () => {};
            replace.mockImplementationOnce(
              () =>
                new Promise((resolveReplace) => {
                  finishReplace = () =>
                    resolveReplace({
                      event: event([]),
                      accepted: ["wss://one/" as RelayUrl],
                      rejected: [],
                    });
                }),
            );

            const saving = settings.relayList.save();
            expect(settings.relayList.saving()).toBe(true);
            expect(settings.relayList.add("wss://two/")).toBe(false);
            settings.relayList.toggle("wss://one/", "write");
            settings.relayList.remove("wss://one/");
            expect(settings.relayList.draft()).toEqual([
              { url: "wss://one/", read: true, write: true },
            ]);

            finishReplace();
            await saving;
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
