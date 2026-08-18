import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { ReactionRequests } from "../../core/read/reaction-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import Avatar from "./Avatar";
import type { AvatarProps } from "./Avatar";

// EventView.test.tsx / Note.test.tsx と同じ手法: 種から 32 byte 鍵を作り
// schnorr で実署名する (EventStore.put の verifyEvent を通すため)。
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

/**
 * `ProfileRequests` のテストダブル。`request` の呼び出しを記録し、
 * `settle()` でバッチ完了を模す (`EventView.test.tsx` の
 * `createFakeEventRequests` と同じ形)。
 */
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
const fakeReactions = (): ReactionRequests => ({
  request() {},
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

/**
 * `Avatar` は `ProfileHover` (`HoverCard.Root`) を返すようになった。
 * `HoverCard.Root` は素通しの context provider を重ねただけなので DOM
 * ノードを持たず、直接関数として呼ぶと `children` を解決する memo
 * 関数が返る (`Note.test.tsx` の「代役に本物を使わない」注記と同じ根
 * 本の理由: Solid が実要素ではなく読み取り関数を返す)。加えて `<Portal>`
 * が枠と同じ列に並ぶため、解決した先は `[トリガー要素, Portal の
 * マーカー]` の配列になる (`ProfileHover.test.tsx` を書く前に実際に
 * 描画して確かめた形)。トリガー要素だけを取り出す。
 */
const resolveElement = (result: unknown): HTMLElement => {
  let value = result;
  while (typeof value === "function") value = (value as () => unknown)();
  return (Array.isArray(value) ? value[0] : value) as HTMLElement;
};

/**
 * `EventView.test.tsx`/`Note.test.tsx` と同じ手法: Solid コンポーネントを
 * JSX を介さず関数として直接呼び、返ってきた DOM ノードを検証する。
 */
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
      reactions: fakeReactions(),
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
    // 以降の行が横にずれる原因になる、brief の「real consequences」2 番)
    const store = new EventStore();
    const { profiles, requested } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [],
    };
    const pubkey = pubkeyFor(2);

    const { element, dispose } = mount({ pubkey, size: "full" }, ctx);
    try {
      const el = element();
      expect(el.dataset.testid).toBe("avatar");
      expect(el.querySelector("img")).toBeNull();
      // `ProfileHover` (`HoverCard.Root`) を挟むようになってから、同じ
      // pubkey への `request` が複数回来る (zag のマシン初期化が Solid の
      // 更新フラッシュをもう 1 周させるため、実測で 2 回)。
      // `ProfileRequests` は pubkey を `Set` でまとめるので重複要求は
      // 実害が無い (`profile-data.ts`/`profile-requests.ts` の設計)。
      // ここで主張したいのはその頑健性の中身 (回数) ではなく「要求した
      // pubkey が正しいか」なので、回数は固定しない。
      expect(requested.length).toBeGreaterThan(0);
      expect(new Set(requested)).toEqual(new Set([pubkey]));
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
      reactions: fakeReactions(),
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
      expect(el.querySelector("img")).toBeNull(); // 届く前は枠だけ

      store.put(event, "wss://relay/");
      settle();

      const img = el.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
      // 枠自体 (data-testid=avatar) は同じ要素のまま —— 画像の到着で
      // 差し替わったりレイアウトが動いたりしない
      expect(el.dataset.testid).toBe("avatar");
    } finally {
      dispose();
    }
  });

  it("avatar 要素そのものが hover-card のトリガー属性を持つ (包む要素を挟まない)", () => {
    // 捕まえる変異: `asChild` をやめて `<ProfileHover>` で包む形に戻す。
    // 包む要素を挟むと、`avatar` の枠 (`sticky top-0`) はその小さな包みの
    // 中でしか動けなくなり、スクロールしても上端に貼り付かなくなる
    // (仕様 5.1 節)。jsdom は CSS を評価しないので、この主張は「avatar
    // 要素自身がトリガーの属性を受け取っているか」という DOM の形で行う。
    // 属性名は実際に描画して確かめたもの (`data-scope`/`data-part`)。
    const store = new EventStore();
    const { profiles } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      reactions: fakeReactions(),
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
    // 捕まえる変異: `sticky`/`top-0` クラスを落とす (本文が伸びてスクロール
    // しても誰の投稿か見失わないための固定、spec 3 節)。
    const store = new EventStore();
    const { profiles } = createFakeProfileRequests();
    const ctx: RenderContextValue = {
      store,
      events: fakeEvents(),
      profiles,
      reactions: fakeReactions(),
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
