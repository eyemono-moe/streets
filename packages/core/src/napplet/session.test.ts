import { describe, expect, it, vi } from "vite-plus/test";
import type { NostrEvent } from "../nostr/event";
import type { RelayFilter } from "../relay/relay-connection";
import type { IntentRequest } from "./intent";
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
  const fetched: { url: string; signal: AbortSignal }[] = [];
  const invoked: IntentRequest[] = [];
  const emitted: { topic: string; payload: unknown }[] = [];
  const published: Parameters<NappletHost["publish"]>[0][] = [];
  const links: Parameters<NappletHost["openLink"]>[] = [];
  const keys: Parameters<NappletHost["forwardKey"]>[0][] = [];
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
    inc: { emit: (topic, payload) => void emitted.push({ topic, payload }) },
    forwardKey: (key) => void keys.push(key),
    openLink: async (target, label) => {
      links.push([target, label]);
      return { status: "opened" };
    },
    publish: async (request) => {
      published.push(request);
      if (request.draft.content === "refuse") {
        return { ok: false, error: "user cancelled" };
      }
      return {
        ok: true,
        event: { ...note("e".repeat(64)), ...request.draft },
        relays: { "wss://relay.example/": true },
      };
    },
    intent: {
      invoke: async (request) => {
        invoked.push(request);
        return {
          ok: true,
          archetype: request.archetype,
          action: request.action,
          convention: request.convention,
          handler: "streets",
        };
      },
      available: (archetype) => ({
        archetype,
        available: false,
        candidates: [],
        hasDefault: false,
      }),
      handlers: () => [],
    },
    fetchResource: async (url, _servers, signal) => {
      fetched.push({ url, signal });
      return url.includes("missing")
        ? { ok: false, error: "not-found" }
        : { ok: true, blob: new Blob(["png"]), mime: "image/png" };
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
  return {
    session,
    sent,
    opened,
    fetched,
    invoked,
    emitted,
    published,
    links,
    keys,
  };
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
});

describe("NAP-RESOURCE", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  // @napplet/shim: 成功は `resource.bytes.result`、失敗は `resource.bytes.error` で返す。
  it("取れたら Blob と種類を、取れなければ error を、別の種類のメッセージで返す", async () => {
    const { session, sent } = setup(["resource"]);
    session.receive({
      type: "resource.bytes",
      id: "r1",
      url: "https://a.example/x.png",
    });
    session.receive({
      type: "resource.bytes",
      id: "r2",
      url: "https://a.example/missing.png",
    });
    await settle();
    expect(sent).toEqual([
      {
        type: "resource.bytes.result",
        id: "r1",
        blob: expect.any(Blob),
        mime: "image/png",
      },
      { type: "resource.bytes.error", id: "r2", error: "not-found" },
    ]);
  });

  it("cancel された取得は止め、結果を送らない", async () => {
    const { session, sent, fetched } = setup(["resource"]);
    session.receive({
      type: "resource.bytes",
      id: "r",
      url: "https://a.example/x.png",
    });
    session.receive({ type: "resource.cancel", id: "r" });
    await settle();
    expect(fetched[0]?.signal.aborted).toBe(true);
    expect(sent).toEqual([]);
  });

  it("bytesMany は頼んだ順に、URL ごとの結果を並べて返す", async () => {
    const { session, sent } = setup(["resource"]);
    session.receive({
      type: "resource.bytesMany",
      id: "m",
      requests: [
        { url: "https://a.example/missing.png" },
        { url: "https://a.example/x.png" },
      ],
    });
    await settle();
    expect(sent).toEqual([
      {
        type: "resource.bytesMany.result",
        id: "m",
        items: [
          {
            url: "https://a.example/missing.png",
            ok: false,
            error: "not-found",
          },
          {
            url: "https://a.example/x.png",
            ok: true,
            blob: expect.any(Blob),
            mime: "image/png",
          },
        ],
      },
    ]);
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

describe("NAP-INTENT", () => {
  // > The runtime MUST reject a normalized wire request when:
  // > - the convention archetype differs from `request.archetype`
  it("食い違う要求は受け手を探さずに断る", async () => {
    const { session, sent, invoked } = setup(["shell", "intent"]);
    session.receive({
      type: "intent.invoke",
      id: "i1",
      request: {
        archetype: "note",
        action: "open",
        convention: "napplet:profile/open",
      },
    });
    await Promise.resolve();
    expect(invoked).toEqual([]);
    expect(sent).toEqual([
      {
        type: "intent.invoke.result",
        id: "i1",
        result: { ok: false, error: "invalid convention" },
      },
    ]);
  });

  // NAP-INTENT の「Invoke a convention URI」の例。
  it("要求に同じ id で結果を返す", async () => {
    const { session, sent } = setup(["shell", "intent"]);
    session.receive({
      type: "intent.invoke",
      id: "i1",
      request: {
        archetype: "profile",
        action: "open",
        convention: "napplet:profile/open",
        payload: { pubkey: "abc123..." },
      },
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      type: "intent.invoke.result",
      id: "i1",
      result: {
        ok: true,
        archetype: "profile",
        action: "open",
        convention: "napplet:profile/open",
        handler: "streets",
      },
    });
  });

  // > The runtime MUST deliver `IntentDelivery` only after the target is ready.
  it("届ける依頼は、napplet が起動し終えるまで待たせる", () => {
    const { session, sent } = setup(["shell", "intent"]);
    const delivery = {
      sender: "streets",
      archetype: "profile",
      action: "open",
      convention: "napplet:profile/open",
      payload: { pubkey: "abc123..." },
    };
    session.deliver(delivery);
    expect(sent).toEqual([]);
    session.receive({ type: "shell.ready" });
    expect(sent.at(-1)).toEqual({ type: "intent.deliver", delivery });
  });
});

describe("NAP-INC", () => {
  // NAP-INC の「Subscribe」「Event delivery」の例。
  it("購読した話題の知らせだけを渡す", () => {
    const { session, sent } = setup(["shell", "inc"]);
    session.receive({
      type: "inc.subscribe",
      id: "a1",
      topic: "napplet:profile/open",
    });
    expect(sent).toEqual([{ type: "inc.subscribe.result", id: "a1" }]);
    const event = {
      topic: "napplet:profile/open",
      sender: "endpoint-social-feed",
      payload: { pubkey: "abc123..." },
    };
    session.incEvent(event);
    session.incEvent({ ...event, topic: "napplet:note/open" });
    expect(sent.slice(1)).toEqual([{ type: "inc.event", ...event }]);
  });

  // > `inc.unsubscribe` is fire-and-forget (no `id`, no result message).
  it("購読をやめた話題は渡さない", () => {
    const { session, sent } = setup(["shell", "inc"]);
    session.receive({ type: "inc.subscribe", id: "a1", topic: "t" });
    session.receive({ type: "inc.unsubscribe", topic: "t" });
    session.incEvent({ topic: "t", sender: "s" });
    expect(sent).toHaveLength(1);
  });

  // > `inc.emit` has no `id` field — it is fire-and-forget with no acknowledgment.
  it("送った話題を Streets に渡し、答えは返さない", () => {
    const { session, sent, emitted } = setup(["shell", "inc"]);
    session.receive({
      type: "inc.emit",
      topic: "napplet:profile/open",
      payload: { pubkey: "abc123..." },
    });
    expect(emitted).toEqual([
      { topic: "napplet:profile/open", payload: { pubkey: "abc123..." } },
    ]);
    expect(sent).toEqual([]);
  });
});

describe("書き込み", () => {
  // @napplet/shim: relay.publish は署名済みのイベントで resolve し、断られたら reject する。
  it("relay.publish は確かめて署名したイベントを返し、断られたら error を返す", async () => {
    const { session, sent, published } = setup(["shell", "relay"]);
    session.receive({
      type: "relay.publish",
      id: "p1",
      event: { kind: 1, content: "hi", tags: [], created_at: 1 },
    });
    session.receive({
      type: "relay.publish",
      id: "p2",
      event: { kind: 1, content: "refuse", tags: [] },
    });
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(published[0]).toEqual({
      operation: "publish",
      draft: { kind: 1, content: "hi", tags: [] },
    });
    expect(sent).toContainEqual(
      expect.objectContaining({
        type: "relay.publish.result",
        id: "p1",
        event: expect.objectContaining({ kind: 1, content: "hi" }),
      }),
    );
    expect(sent).toContainEqual({
      type: "relay.publish.result",
      id: "p2",
      error: "user cancelled",
    });
  });

  it("NIP-04 での暗号化と、宛先の無い暗号化は断る", () => {
    const { session, sent, published } = setup(["shell", "relay"]);
    const event = { kind: 4, content: "secret", tags: [] };
    session.receive({
      type: "relay.publishEncrypted",
      id: "e1",
      event,
      recipient: "b".repeat(64),
      encryption: "nip04",
    });
    session.receive({ type: "relay.publishEncrypted", id: "e2", event });
    expect(published).toEqual([]);
    expect(sent.map((message) => message.error)).toEqual([
      "unsupported: only nip44 encryption",
      "invalid: recipient",
    ]);
  });

  // NAP-OUTBOX: 結果は reject せず `{ ok, event, eventId, relays, error }` で返す。
  it("outbox.publish は行き先ごとの結果を返し、添えたリレーは絞って足す", async () => {
    const { session, sent, published } = setup(["shell", "outbox"]);
    session.receive({
      type: "outbox.publish",
      id: "o1",
      event: { kind: 1, content: "hi", tags: [] },
      options: {
        relays: [
          "wss://a.example/",
          "not a relay",
          "wss://b.example/",
          "wss://c.example/",
          "wss://d.example/",
          "wss://e.example/",
        ],
      },
    });
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(published[0]?.relays).toHaveLength(4);
    expect(sent[0]).toMatchObject({
      type: "outbox.publish.result",
      id: "o1",
      ok: true,
      eventId: "e".repeat(64),
      relays: { "wss://relay.example/": true },
    });
  });
});

describe("NAP-LINK", () => {
  // NAP-LINK の「Open an external page」と「Denied by policy」の例。
  it("確かめた行き先だけを開き、断ったものは理由を添えて返す", async () => {
    const { session, sent, links } = setup(["shell", "link"]);
    session.receive({
      type: "link.open",
      id: "l1",
      url: "https://example.com/post/123",
      options: { label: "Read post" },
    });
    session.receive({ type: "link.open", id: "l2", url: "file:///etc/passwd" });
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(links).toEqual([
      [
        {
          type: "web",
          url: "https://example.com/post/123",
          hostname: "example.com",
        },
        "Read post",
      ],
    ]);
    expect(sent).toContainEqual({
      type: "link.open.result",
      id: "l1",
      status: "opened",
    });
    expect(sent).toContainEqual({
      type: "link.open.result",
      id: "l2",
      status: "denied",
      error: "unsupported-scheme",
    });
  });
});

describe("NAP-KEYS", () => {
  // NAP-KEYS の「Forward an unbound keystroke」の例。
  // > The shell MUST accept `keys.forward` messages and process the forwarded keystroke
  it("送られたキーを Streets に渡し、答えは返さない", () => {
    const { session, sent, keys } = setup(["shell", "keys"]);
    const key = {
      key: "j",
      code: "KeyJ",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };
    session.receive({ type: "keys.forward", ...key });
    session.receive({ type: "keys.forward", key: "j" });
    expect(keys).toEqual([key]);
    expect(sent).toEqual([]);
  });

  // > The shell MAY ... leave the action unbound until the user configures it.
  // > The shell MUST push `keys.bindings` whenever the binding set for a napplet changes
  it("操作の登録は受け付けて割り当てず、同じ id の 2 度目は断る", () => {
    const { session, sent } = setup(["shell", "keys"]);
    const action = { id: "editor.save", label: "Save", defaultKey: "Ctrl+S" };
    session.receive({ type: "keys.registerAction", id: "r1", action });
    session.receive({ type: "keys.registerAction", id: "r2", action });
    expect(sent).toEqual([
      {
        type: "keys.registerAction.result",
        id: "r1",
        actionId: "editor.save",
      },
      { type: "keys.bindings", bindings: [] },
      {
        type: "keys.registerAction.result",
        id: "r2",
        actionId: "editor.save",
        error: "duplicate action ID",
      },
    ]);
  });
});
