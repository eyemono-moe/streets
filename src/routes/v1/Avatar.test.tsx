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
        element = Avatar(props) as unknown as HTMLElement;
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
});
