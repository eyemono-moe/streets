import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import ProfileCard from "./ProfileCard";
import { npubLabel } from "./npub-label";

// EventStore.put の verifyEvent を通すため、種から作った鍵で実署名する。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const pubkeyFor = (seed: number) =>
  bytesToHex(schnorr.getPublicKey(keyFor(seed)));

const signed = (
  seed: number,
  overrides: Partial<NostrEvent> = {},
): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: overrides.created_at ?? 1_700_000_000,
    kind: overrides.kind ?? 0,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "{}",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

const createRecordingEventRequests = (): EventRequests & {
  requested: string[];
} => {
  const requested: string[] = [];
  return {
    requested,
    request(id) {
      requested.push(id);
    },
    isUnresolved() {
      return false;
    },
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  };
};

const fakeProfiles = (): ProfileRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const fakeReactions = (): EngagementRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const contextWith = (
  events: EventRequests,
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events,
  profiles: fakeProfiles(),
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  renderers: [],
});

/** `ProfileCard` のトップレベルは `<div>` (`<Show>` ではない) なのでアクセサ変換は要らない。 */
const mount = (
  render: () => unknown,
  ctx: RenderContextValue,
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        element = render() as unknown as HTMLElement;
        return null;
      },
    });
  });
  return {
    element: () => {
      if (!element) throw new Error("component did not mount");
      return element;
    },
    dispose: disposeRoot,
  };
};

describe("ProfileCard", () => {
  it("kind:0 が無くても短縮 npub で描かれる", () => {
    // 捕まえる変異: 未取得のとき何も描かない (ホバーしても空の枠が出る)
    const events = createRecordingEventRequests();
    const pubkey = pubkeyFor(200);
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.dataset.testid).toBe("profile-card");
      const name = el.querySelector('[data-testid="profile-card-name"]');
      expect(name?.textContent).toBe(npubLabel(pubkey));
    } finally {
      dispose();
    }
  });

  it("display_name と @name が両方出る", () => {
    // 捕まえる変異: どちらか片方しか出さない
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(201, {
      content: JSON.stringify({ name: "handle", display_name: "表示名" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const name = el.querySelector('[data-testid="profile-card-name"]');
      expect(name?.textContent).toBe("表示名");
      expect(el.textContent).toContain("@handle");
    } finally {
      dispose();
    }
  });

  it("display_name が無いとき @name を重ねて出さない (同じ文字列が2度並ばない)", () => {
    // 捕まえる変異: `name` があれば無条件で `@name` も出す (display_name
    // が無いと name が太字側へ落ちるので、同じ文字列が2度出る)。
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(208, {
      content: JSON.stringify({ name: "alice" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const name = el.querySelector('[data-testid="profile-card-name"]');
      expect(name?.textContent).toBe("alice");
      expect(el.textContent).not.toContain("@alice");
    } finally {
      dispose();
    }
  });

  it('about のカスタム絵文字が <img data-testid="content-emoji"> になる', () => {
    // 捕まえる変異: about を素のテキストで出す
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(202, {
      content: JSON.stringify({ about: "やあ :partyparrot:" }),
      tags: [["emoji", "partyparrot", "https://example.com/pp.png"]],
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const img = el.querySelector<HTMLImageElement>(
        '[data-testid="content-emoji"]',
      );
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/pp.png");
      expect(el.textContent).not.toContain(":partyparrot:");
    } finally {
      dispose();
    }
  });

  it("about の nostr:note が event-ref-text として残る (引用カードを生やさない)", () => {
    // 捕まえる変異: eventRefs="embed" を渡す (カードの中に引用カードが生える)
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const quoted = signed(203, { kind: 1, content: "quoted note" });
    const profileEvent = signed(204, {
      content: JSON.stringify({
        about: `見て nostr:${encodeBech32("note", quoted.id)}`,
      }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="event-ref-text"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("about の中の nostr:npub 言及にはホバーのトリガーを付けない (入れ子でカードが出ない)", () => {
    // 捕まえる変異: `ProfileHoverSuppressedProvider` を外す (カードの中の
    // 自己紹介文にホバーを付けると「またカード」の入れ子になる)。
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const mentioned = pubkeyFor(206);
    const profileEvent = signed(207, {
      content: JSON.stringify({
        about: `友達 nostr:${encodeBech32("npub", mentioned)}`,
      }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      // 言及自体は描かれる (ホバーが無いだけ)。
      expect(el.querySelector('[data-testid="profile"]')).not.toBeNull();
      expect(
        el.querySelector('[data-scope="hover-card"][data-part="trigger"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });

  it("website が javascript: のとき <a> にならず、素のテキストで行が残る", () => {
    // 捕まえる変異: scheme を確かめずリンクにする (http(s) 以外は素の
    // テキストで残す)。
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(205, {
      content: JSON.stringify({ website: "javascript:alert(1)" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const website = el.querySelector('[data-testid="profile-website"]');
      expect(website).not.toBeNull();
      expect(website?.tagName).toBe("SPAN");
      expect(website?.textContent).toBe("javascript:alert(1)");
    } finally {
      dispose();
    }
  });

  it("website がスキーム無し (example.com) のとき、行ごと消えず素のテキストで残る", () => {
    // 捕まえる変異: http(s) でない website を undefined へ落として消す
    // (スキーム無しは実データで非常に多い)。
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(209, {
      content: JSON.stringify({ website: "example.com" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const website = el.querySelector('[data-testid="profile-website"]');
      expect(website).not.toBeNull();
      expect(website?.tagName).toBe("SPAN");
      expect(website?.textContent).toBe("example.com");
    } finally {
      dispose();
    }
  });

  it("website が https:// のとき <a href> のリンクになる", () => {
    // 捕まえる変異: isHttpUrl を常に false に倒す。
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(210, {
      content: JSON.stringify({ website: "https://example.com/me" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const website = el.querySelector('[data-testid="profile-website"]');
      expect(website).not.toBeNull();
      expect(website?.tagName).toBe("A");
      expect(website?.getAttribute("href")).toBe("https://example.com/me");
    } finally {
      dispose();
    }
  });

  it("nip05 が無ければ NIP-05 の行を出さない", () => {
    // 捕まえる変異: 常に行を出す (空のアイコンだけが並ぶ)
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(206, {
      content: JSON.stringify({ name: "handle" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="profile-nip05"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("検証済みバッジ (i-material-symbols:verified-rounded) を出さない", () => {
    // 捕まえる変異: 検証していないのに検証済みの見た目にする
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(207, {
      content: JSON.stringify({ name: "handle", nip05: "handle@example.com" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="profile-nip05"]')).not.toBeNull();
      expect(el.innerHTML).not.toContain("i-material-symbols:verified-rounded");
    } finally {
      dispose();
    }
  });

  it("nip05 の @ の後ろ (ドメイン部分) だけが出る", () => {
    // 捕まえる変異: nip05Domain を素通しにする (ローカル部分を含めると
    // 嘘の見た目になる)。
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(211, {
      content: JSON.stringify({ nip05: "handle@example.com" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const nip05 = el.querySelector('[data-testid="profile-nip05"]');
      expect(nip05?.textContent).toBe("example.com");
      expect(nip05?.textContent).not.toContain("handle@");
    } finally {
      dispose();
    }
  });

  it("nip05 が @ を含まなければ行を出さない (ドメインを取り出せない)", () => {
    // 捕まえる変異: nip05Domain を素通しにする (常に truthy を返す)
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(212, {
      content: JSON.stringify({ nip05: "not-an-address" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="profile-nip05"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("banner を持つとき <img data-testid=profile-banner> を描く", () => {
    // 捕まえる変異: banner の <img> を丸ごと消す
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(213, {
      content: JSON.stringify({ banner: "https://example.com/banner.png" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const img = el.querySelector<HTMLImageElement>(
        '[data-testid="profile-banner"]',
      );
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/banner.png");
    } finally {
      dispose();
    }
  });

  it("picture を持つとき <img data-testid=profile-picture> を描く", () => {
    // 捕まえる変異: picture の <img> を丸ごと消す
    const events = createRecordingEventRequests();
    const store = new EventStore();
    const profileEvent = signed(214, {
      content: JSON.stringify({ picture: "https://example.com/pic.png" }),
    });
    store.put(profileEvent, "wss://relay/");
    const { element, dispose } = mount(
      () => ProfileCard({ pubkey: profileEvent.pubkey }),
      contextWith(events, store),
    );
    try {
      const el = element();
      const img = el.querySelector<HTMLImageElement>(
        '[data-testid="profile-picture"]',
      );
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/pic.png");
    } finally {
      dispose();
    }
  });
});
