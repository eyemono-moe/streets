import { describe, expect, it, vi } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import {
  NAPPLET_MAX_LIMIT,
  NAPPLET_QUERY_TIMEOUT_MS,
  type NappletHost,
  type NappletSubscriptionSink,
  createNappletSession,
  nappletProfile,
  sanitizeNappletFilters,
} from "./session";

const note = (id: string): NostrEvent => ({
  id,
  pubkey: "b".repeat(64),
  created_at: 1_760_000_000,
  kind: 1,
  content: "hi",
  tags: [],
  sig: "c".repeat(128),
});

const setup = (
  domains: string[] = [
    "shell",
    "theme",
    "identity",
    "storage",
    "relay",
    "outbox",
  ],
) => {
  const sent: Record<string, unknown>[] = [];
  const opened: {
    filters: RelayFilter[];
    sink: NappletSubscriptionSink;
    hints?: readonly string[];
    closed: boolean;
  }[] = [];
  const stored = new Map<string, string>();
  const host: NappletHost = {
    domains,
    publicKey: () => "a".repeat(64),
    relays: () => ({ "wss://relay.example/": { read: true, write: false } }),
    profile: async () => ({ name: "alice" }),
    follows: async () => ["f".repeat(64)],
    mutes: async () => [],
    theme: () => ({
      colors: { background: "#000000", text: "#ffffff", primary: "#8440bd" },
    }),
    storage: {
      get: (scope, key) => stored.get(`${scope}/${key}`) ?? null,
      set: (scope, key, value) => {
        if (value.length > 10) throw new Error("quota exceeded");
        stored.set(`${scope}/${key}`, value);
      },
      remove: (scope, key) => void stored.delete(`${scope}/${key}`),
      keys: (scope) =>
        [...stored.keys()]
          .filter((key) => key.startsWith(`${scope}/`))
          .map((key) => key.slice(scope.length + 1)),
    },
    writeRelays: (pubkey) =>
      pubkey === "b".repeat(64) ? ["wss://author.example/"] : undefined,
    subscribe: (filters, sink, hints) => {
      const entry = { filters, sink, hints, closed: false };
      opened.push(entry);
      return () => {
        entry.closed = true;
      };
    },
  };
  const session = createNappletSession(host, (message) => sent.push(message));
  return { session, sent, opened };
};

describe("createNappletSession", () => {
  // NAP-SHELL: > The runtime MUST send `shell.init` exactly once in response to the first `shell.ready`
  it("最初の shell.ready にだけ、渡した機能の一覧で答える", () => {
    const { session, sent } = setup(["shell", "relay"]);
    session.receive({ type: "shell.ready" });
    session.receive({ type: "shell.ready" });
    expect(sent).toEqual([
      {
        type: "shell.init",
        capabilities: { domains: ["shell", "relay"] },
        services: [],
      },
    ]);
  });

  // NIP-5D: > Messages with an unrecognized `type` MUST be silently ignored.
  it("知らない種類と、渡していない機能への要求には答えない", () => {
    const { session, sent } = setup(["theme"]);
    session.receive({ type: "foo.bar", id: "1" });
    session.receive({ type: "storage.get", id: "2", key: "k" });
    session.receive("not an object");
    expect(sent).toEqual([]);
  });

  // NAP-THEME: > The shell MUST include `colors` with all three fields
  it("テーマを返し、変わったら知らせる", () => {
    const { session, sent } = setup();
    session.receive({ type: "theme.get", id: "t1" });
    session.themeChanged();
    expect(sent).toEqual([
      {
        type: "theme.get.result",
        id: "t1",
        theme: {
          colors: {
            background: "#000000",
            text: "#ffffff",
            primary: "#8440bd",
          },
        },
      },
      {
        type: "theme.changed",
        theme: {
          colors: {
            background: "#000000",
            text: "#ffffff",
            primary: "#8440bd",
          },
        },
      },
    ]);
  });

  // NAP-IDENTITY の Wire Protocol の表のとおりの欄で返す。
  it("自分の情報を、NAP-IDENTITY の欄の名前で返す", async () => {
    const { session, sent } = setup();
    session.receive({ type: "identity.getPublicKey", id: "q1" });
    session.receive({ type: "identity.getRelays", id: "q2" });
    session.receive({ type: "identity.getProfile", id: "q3" });
    session.receive({ type: "identity.getFollows", id: "q4" });
    session.receive({ type: "identity.getBadges", id: "q5" });
    await Promise.resolve();
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          type: "identity.getPublicKey.result",
          id: "q1",
          pubkey: "a".repeat(64),
        },
        {
          type: "identity.getRelays.result",
          id: "q2",
          relays: { "wss://relay.example/": { read: true, write: false } },
        },
        {
          type: "identity.getProfile.result",
          id: "q3",
          profile: { name: "alice" },
        },
        {
          type: "identity.getFollows.result",
          id: "q4",
          pubkeys: ["f".repeat(64)],
        },
        { type: "identity.getBadges.result", id: "q5", error: "unsupported" },
      ]),
    );
  });

  // NAP-STORAGE: > `scope: "instance"` … MUST further isolate the namespace per instance
  it("保存は共有と窓ごとを分け、枠を超えたら error で返す", () => {
    const { session, sent } = setup();
    session.receive({
      type: "storage.set",
      id: "s1",
      key: "k",
      value: "shared",
    });
    session.receive({
      type: "storage.set",
      id: "s2",
      key: "k",
      value: "mine",
      scope: "instance",
    });
    session.receive({ type: "storage.get", id: "s3", key: "k" });
    session.receive({
      type: "storage.get",
      id: "s4",
      key: "k",
      scope: "instance",
    });
    session.receive({ type: "storage.get", id: "s5", key: "missing" });
    session.receive({
      type: "storage.set",
      id: "s6",
      key: "big",
      value: "x".repeat(11),
    });
    expect(sent).toEqual([
      { type: "storage.set.result", id: "s1" },
      { type: "storage.set.result", id: "s2" },
      { type: "storage.get.result", id: "s3", value: "shared" },
      { type: "storage.get.result", id: "s4", value: "mine" },
      { type: "storage.get.result", id: "s5", value: null },
      { type: "storage.set.result", id: "s6", error: "quota exceeded" },
    ]);
  });

  it("購読で届いたイベントと EOSE を subId を付けて渡し、close で閉じる", () => {
    const { session, sent, opened } = setup();
    session.receive({
      type: "relay.subscribe",
      id: "r1",
      subId: "s",
      filters: [{ kinds: [1] }],
    });
    expect(opened[0]?.filters).toEqual([
      { kinds: [1], limit: NAPPLET_MAX_LIMIT },
    ]);
    opened[0]?.sink.event(note("1"), "wss://relay.example/");
    opened[0]?.sink.eose();
    session.receive({ type: "relay.close", id: "r2", subId: "s" });
    expect(sent).toEqual([
      {
        type: "relay.event",
        subId: "s",
        result: {
          event: note("1"),
          sidecar: { relayHints: ["wss://relay.example/"] },
        },
      },
      { type: "relay.eose", subId: "s" },
    ]);
    expect(opened[0]?.closed).toBe(true);
  });

  // NAP-RELAY: > Subscription filters SHOULD be validated to prevent resource exhaustion
  it("何も絞らない購読と、リレーを指定した購読は張らずに閉じたと返す", () => {
    const { session, sent, opened } = setup();
    session.receive({
      type: "relay.subscribe",
      id: "r1",
      subId: "a",
      filters: [{ limit: 10 }],
    });
    session.receive({
      type: "relay.subscribe",
      id: "r2",
      subId: "b",
      filters: [{ kinds: [9] }],
      relay: "wss://groups.example",
    });
    expect(opened).toEqual([]);
    expect(sent).toEqual([
      { type: "relay.closed", subId: "a", reason: "invalid: filters" },
      { type: "relay.closed", subId: "b", reason: "unsupported: scoped relay" },
    ]);
  });

  it("query は EOSE までに届いたものを重ねずにまとめて返し、購読を閉じる", () => {
    const { session, sent, opened } = setup();
    session.receive({
      type: "relay.query",
      id: "q",
      filters: [{ kinds: [0], authors: ["b".repeat(64)] }],
    });
    opened[0]?.sink.event(note("1"), "wss://a/");
    opened[0]?.sink.event(note("1"), "wss://b/");
    opened[0]?.sink.eose();
    expect(sent).toEqual([
      {
        type: "relay.query.result",
        id: "q",
        events: [{ event: note("1"), sidecar: { relayHints: ["wss://a/"] } }],
      },
    ]);
    expect(opened[0]?.closed).toBe(true);
  });

  it("query は EOSE が来なくても時間が来たら、それまでのものを返す", () => {
    vi.useFakeTimers();
    try {
      const { session, sent, opened } = setup();
      session.receive({
        type: "relay.query",
        id: "q",
        filters: [{ ids: ["1"] }],
      });
      opened[0]?.sink.event(note("1"));
      vi.advanceTimersByTime(NAPPLET_QUERY_TIMEOUT_MS);
      expect(sent).toEqual([
        { type: "relay.query.result", id: "q", events: [{ event: note("1") }] },
      ]);
      expect(opened[0]?.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("書き込みはまだ受けず、error で返す", () => {
    const { session, sent } = setup();
    session.receive({
      type: "relay.publish",
      id: "p",
      event: { kind: 1, content: "", tags: [] },
    });
    expect(sent[0]).toMatchObject({ type: "relay.publish.result", id: "p" });
    expect(sent[0]?.error).toMatch(/^unsupported/);
  });

  it("閉じたら購読をすべて閉じ、それ以降は何も送らない", () => {
    const { session, sent, opened } = setup();
    session.receive({
      type: "relay.subscribe",
      id: "r",
      subId: "s",
      filters: [{ kinds: [1] }],
    });
    session.dispose();
    opened[0]?.sink.event(note("1"));
    session.receive({ type: "theme.get", id: "t" });
    expect(opened[0]?.closed).toBe(true);
    expect(sent).toEqual([]);
  });
});

describe("NAP-OUTBOX", () => {
  // NAP-OUTBOX: > `outbox.getEvent` is a request; `outbox.event` remains the subscription push message.
  it("購読のイベントを outbox.event で渡し、EOSE は知らせない", () => {
    const { session, sent, opened } = setup();
    session.receive({
      type: "outbox.subscribe",
      id: "o1",
      subId: "s",
      filters: { authors: ["b".repeat(64)], kinds: [1] },
      options: { relays: ["wss://hint.example/", "https://not-a-relay"] },
    });
    expect(opened[0]?.hints).toEqual(["wss://hint.example/"]);
    opened[0]?.sink.event(note("1"), "wss://author.example/");
    opened[0]?.sink.eose();
    session.receive({ type: "outbox.close", id: "o2", subId: "s" });
    expect(sent).toEqual([
      {
        type: "outbox.event",
        subId: "s",
        result: {
          event: note("1"),
          sidecar: { relayHints: ["wss://author.example/"] },
        },
      },
    ]);
    expect(opened[0]?.closed).toBe(true);
  });

  // NAP-OUTBOX: > `filters` are NIP-01 filters, either one filter or an array of filters.
  it("query は 1 つのフィルタも受け、時間が来たら incomplete を付けて返す", () => {
    vi.useFakeTimers();
    try {
      const { session, sent, opened } = setup();
      session.receive({
        type: "outbox.query",
        id: "q",
        filters: { authors: ["b".repeat(64)], kinds: [1] },
        options: { timeoutMs: 3000 },
      });
      opened[0]?.sink.event(note("1"));
      vi.advanceTimersByTime(3000);
      expect(sent).toEqual([
        {
          type: "outbox.query.result",
          id: "q",
          events: [{ event: note("1") }],
          incomplete: true,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getEvent は著者が分かればその人の書き込み先から引き、見つかったものを result で返す", () => {
    const { session, sent, opened } = setup();
    session.receive({
      type: "outbox.getEvent",
      id: "e",
      eventId: "1".repeat(64),
      options: { author: "b".repeat(64) },
    });
    expect(opened[0]?.filters).toEqual([
      { ids: ["1".repeat(64)], authors: ["b".repeat(64)], limit: 1 },
    ]);
    opened[0]?.sink.event(note("1".repeat(64)));
    opened[0]?.sink.eose();
    expect(sent).toEqual([
      {
        type: "outbox.getEvent.result",
        id: "e",
        result: { event: note("1".repeat(64)) },
      },
    ]);
  });

  it("resolveRelays は著者の書き込み先を返し、分からない著者を挙げる", () => {
    const { session, sent } = setup();
    session.receive({
      type: "outbox.resolveRelays",
      id: "r",
      target: { authors: ["b".repeat(64), "c".repeat(64)], direction: "read" },
    });
    expect(sent).toEqual([
      {
        type: "outbox.resolveRelays.result",
        id: "r",
        plan: {
          relays: ["wss://author.example/"],
          source: "nip65",
          missingAuthors: ["c".repeat(64)],
        },
      },
    ]);
  });

  it("書き込みはまだ受けず、ok: false で返す", () => {
    const { session, sent } = setup();
    session.receive({ type: "outbox.publish", id: "p", event: { kind: 1 } });
    expect(sent[0]).toMatchObject({
      type: "outbox.publish.result",
      id: "p",
      ok: false,
    });
  });
});

describe("sanitizeNappletFilters", () => {
  it("知らないキーを落とし、limit を上限で切る", () => {
    expect(
      sanitizeNappletFilters([
        { kinds: [1], limit: 10_000, "#t": ["nostr"], unknown: 1 },
      ]),
    ).toEqual([{ kinds: [1], limit: NAPPLET_MAX_LIMIT, "#t": ["nostr"] }]);
  });

  it("形の合わない値があれば受けない", () => {
    expect(sanitizeNappletFilters([{ kinds: ["1"] }])).toBeUndefined();
    expect(sanitizeNappletFilters([])).toBeUndefined();
    expect(sanitizeNappletFilters([{ kinds: [1] }, "x"])).toBeUndefined();
  });

  // NAP-OUTBOX: > either one filter or an array of filters.
  it("1 つのフィルタを、1 つだけの並びとして受ける", () => {
    expect(sanitizeNappletFilters({ kinds: [1] })).toEqual([
      { kinds: [1], limit: NAPPLET_MAX_LIMIT },
    ]);
  });
});

describe("nappletProfile", () => {
  it("kind:0 の中身を ProfileData の名前にし、空の欄を落とす", () => {
    expect(
      nappletProfile(
        JSON.stringify({
          name: "a",
          display_name: "A",
          about: " ",
          lud16: "a@b.c",
        }),
      ),
    ).toEqual({ name: "a", displayName: "A", lud16: "a@b.c" });
    expect(nappletProfile("not json")).toBeNull();
  });
});
