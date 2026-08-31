import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import Avatar from "./Avatar";
import type { AvatarProps } from "./Avatar";

// EventStore.put の verifyEvent を通すため、種から作った鍵で実署名する。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

const pubkeyFor = (seed: number) =>
  bytesToHex(schnorr.getPublicKey(keyFor(seed)));

const signedProfile = (seed: number, content: string): NostrEvent => {
  const sk = keyFor(seed);
  const unsigned = {
    pubkey: bytesToHex(schnorr.getPublicKey(sk)),
    created_at: 1_700_000_000,
    kind: 0,
    tags: [],
    content,
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

/** `request` の呼び出しを記録し、`settle()` でバッチ完了を模すテストダブル。 */
const createFakeProfileRequests = () => {
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  const profiles: ProfileRequests = {
    request(pubkey) {
      requested.push(pubkey);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {
      listeners.clear();
    },
  };
  return {
    profiles,
    requested,
    settle: () => {
      for (const listener of [...listeners]) listener();
    },
  };
};

/** `Avatar` は events を使わないが `RenderContextValue` の必須項目。 */
const fakeEvents = (): EventRequests => ({
  request() {},
  isUnresolved: () => false,
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

/** `Avatar` は reactions も使わないが `RenderContextValue` の必須項目。 */
const fakeReactions = (): EngagementRequests => ({
  request() {},
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

/**
 * `HoverCard.Root` は DOM ノードを持たず、直接呼ぶと memo 関数が返る。
 * `<Portal>` が並ぶため解決先は配列になるので、トリガー要素だけを取り出す。
 */
const resolveElement = (result: unknown): HTMLElement => {
  let value = result;
  while (typeof value === "function") value = (value as () => unknown)();
  return (Array.isArray(value) ? value[0] : value) as HTMLElement;
};

/** Solid コンポーネントを JSX を介さず関数として直接呼び、返ってきた DOM ノードを検証する。 */
const mount = (
  props: AvatarProps,
  ctx: RenderContextValue,
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        element = resolveElement(Avatar(props));
        return null;
      },
    });
  });
  return {
    element: () => {
      if (!element) throw new Error("Avatar did not mount");
      return element;
    },
    dispose: disposeRoot,
  };
};

describe("Avatar", () => {
  it("full は w-10、compact は w-8 の枠になる", () => {
    // 捕まえる変異: full/compact で同じ幅クラスを使う (size を無視する)
    const store = new EventStore();
    const { profiles } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      engagements: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [],
    };

    const fullRun = mount({ pubkey: pubkeyFor(1), size: "full" }, ctx);
    try {
      expect(fullRun.element().className).toContain("w-10");
      expect(fullRun.element().className).not.toContain("w-8");
    } finally {
      fullRun.dispose();
    }

    const compactRun = mount({ pubkey: pubkeyFor(1), size: "compact" }, ctx);
    try {
      expect(compactRun.element().className).toContain("w-8");
      expect(compactRun.element().className).not.toContain("w-10");
    } finally {
      compactRun.dispose();
    }
  });

  it("プロフィール未取得でも枠 (data-testid=avatar) を出す (レイアウトが後から動かない)", () => {
    // 捕まえる変異: プロフィールが届くまで何も描かない (画像が届くたびに
    // 以降の行が横にずれる原因になる)
    const store = new EventStore();
    const { profiles, requested } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      engagements: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [],
    };
    const pubkey = pubkeyFor(2);

    const { element, dispose } = mount({ pubkey, size: "full" }, ctx);
    try {
      const el = element();
      expect(el.dataset.testid).toBe("avatar");
      expect(el.querySelector("img")).toBeNull();
      // `lazyMount` によりホバー前は `ProfileCard` がマウントされないので
      // `request` を呼ぶのは `Avatar` 自身だけ。
      // 捕まえる変異: `lazyMount`/`unmountOnExit` を外す (2 回呼ばれる)。
      expect(requested).toEqual([pubkey]);
    } finally {
      dispose();
    }
  });

  it("プロフィールに picture が届くと <img> を出す (枠は同じノードのまま)", async () => {
    // 捕まえる変異: 取得後も <img> を出さない/pubkey ではなく無関係な値で
    // 判定する
    const store = new EventStore();
    const { profiles, settle } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      engagements: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [],
    };
    const pubkey = pubkeyFor(3);
    const event = signedProfile(
      3,
      JSON.stringify({ name: "alice", picture: "https://example.com/a.png" }),
    );

    const { element, dispose } = mount({ pubkey, size: "full" }, ctx);
    try {
      const el = element();
      expect(el.querySelector("img")).toBeNull();

      store.put(event, "wss://relay/");
      settle();

      const img = el.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
      // 枠自体は同じ要素のまま —— 画像の到着で差し替わったりしない
      expect(el.dataset.testid).toBe("avatar");
    } finally {
      dispose();
    }
  });

  it("avatar 要素そのものが hover-card のトリガー属性を持つ (包む要素を挟まない)", () => {
    // 捕まえる変異: `asChild` をやめて包む形に戻す (sticky top-0 が包み
    // の中でしか動けなくなる)。jsdom は CSS を評価しないので DOM 属性で見る。
    const store = new EventStore();
    const { profiles } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      engagements: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [],
    };

    const { element, dispose } = mount(
      { pubkey: pubkeyFor(4), size: "full" },
      ctx,
    );
    try {
      const el = element();
      expect(el.dataset.testid).toBe("avatar");
      expect(el.dataset.scope).toBe("hover-card");
      expect(el.dataset.part).toBe("trigger");
    } finally {
      dispose();
    }
  });

  it("avatar 要素は sticky と top-0 を持ったまま", () => {
    // 捕まえる変異: `sticky`/`top-0` を落とす (スクロールで誰の投稿か
    // 見失わないための固定)。
    const store = new EventStore();
    const { profiles } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      engagements: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [],
    };

    const { element, dispose } = mount(
      { pubkey: pubkeyFor(5), size: "full" },
      ctx,
    );
    try {
      const className = element().className;
      expect(className).toContain("sticky");
      expect(className).toContain("top-0");
    } finally {
      dispose();
    }
  });
});
