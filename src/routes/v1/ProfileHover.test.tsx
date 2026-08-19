import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { type JSX, createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { ReactionRequests } from "../../core/read/reaction-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import ProfileHover from "./ProfileHover";

const pubkeyFor = (seed: number) =>
  bytesToHex(
    schnorr.getPublicKey(
      Uint8Array.from(
        Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
      ),
    ),
  );

const fakeProfiles = (): ProfileRequests => ({
  request() {},
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const fakeEvents = (): EventRequests => ({
  request() {},
  isUnresolved: () => false,
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const fakeReactions = (): ReactionRequests => ({
  request() {},
  subscribe: () => () => {},
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const contextWith = (
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events: fakeEvents(),
  profiles: fakeProfiles(),
  reactions: fakeReactions(),
  viewerPubkey: undefined,
  renderers: [],
});

/**
 * `HoverCard.Root` は素通しの context provider を重ねただけで DOM ノードを
 * 持たない。関数として直接呼ぶと `children` を解決する memo 関数が返り
 * (Solid が実要素の代わりに読み取り関数を返す)、`<Portal>` が枠の隣に並ぶ
 * ため最終的に `[トリガー要素, Portal のマーカー]` の配列になる
 * (`Avatar.test.tsx` と同じ形、実際に描画して確かめた)。トリガー要素だけを
 * 取り出す。
 */
const resolveTrigger = (result: unknown): HTMLElement => {
  let value = result;
  while (typeof value === "function") value = (value as () => unknown)();
  return (Array.isArray(value) ? value[0] : value) as HTMLElement;
};

const mount = (
  render: () => unknown,
  ctx: RenderContextValue,
): { trigger: () => HTMLElement; dispose: () => void } => {
  let trigger: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        trigger = resolveTrigger(render());
        return null;
      },
    });
  });
  return {
    trigger: () => {
      if (!trigger) throw new Error("ProfileHover did not mount");
      return trigger;
    },
    dispose: disposeRoot,
  };
};

describe("ProfileHover", () => {
  it("トリガー (data-scope=hover-card, data-part=trigger) を出し、children をそのまま包む", () => {
    // 属性名は実際に描画して確かめたもの (推測で書いていない)。
    const pubkey = pubkeyFor(1);
    const { trigger, dispose } = mount(
      () => ProfileHover({ pubkey, children: "著者名" }),
      contextWith(),
    );
    try {
      const el = trigger();
      expect(el.dataset.testid).toBe("profile-hover-trigger");
      expect(el.dataset.scope).toBe("hover-card");
      expect(el.dataset.part).toBe("trigger");
      expect(el.textContent).toBe("著者名");
    } finally {
      dispose();
    }
  });

  it("トリガーは appearance-none/bg-transparent/cursor-auto を持ち、押せそうに見せない", () => {
    // 捕まえる変異: 押せる合図 (cursor-pointer や hover:underline) を
    // トリガーへ足す。押しても今は何も起きないため、押せる合図を先に出すと
    // 「まだ無い」と「壊れている」の区別が付かなくなる (ADR-0026)。
    //
    // `className` に文字列 "cursor-pointer" が含まれないことだけを見ても、
    // `HoverCard.Trigger` の実体である素の `<button>` に UnoCSS のリセット
    // (`button { cursor: pointer }`、`ButtonFace` 背景) が残っている限り
    // 見た目は変わらない (C-1)。トリガーがそれを打ち消すクラスを実際に
    // 持っていることを単語境界の正規表現で主張する。
    const pubkey = pubkeyFor(2);
    const { trigger, dispose } = mount(
      () => ProfileHover({ pubkey, children: "x" }),
      contextWith(),
    );
    try {
      const className = trigger().className ?? "";
      expect(className).toMatch(/(?:^|\s)appearance-none(?:\s|$)/);
      expect(className).toMatch(/(?:^|\s)bg-transparent(?:\s|$)/);
      expect(className).toMatch(/(?:^|\s)cursor-auto(?:\s|$)/);
      expect(className).not.toMatch(/(?:^|\s)cursor-pointer(?:\s|$)/);
      expect(className).not.toMatch(/(?:^|\s)hover:underline(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("ホバー前は profile-card (HoverCard.Content) を document.body へ一切マウントしない", () => {
    // 捕まえる変異: `<HoverCard.Root>` から `lazyMount`/`unmountOnExit` を
    // 外す。無いと ark-ui 5.38.1 の `usePresence` は `unmounted` を常に
    // `false` にし、`HoverCard.Content` (= `ProfileCard`) がホバー前から
    // `hidden` 属性だけで隠れた状態で常時マウントされる (1 カラムの
    // 初期表示 40 件 × 著者名/アイコンの 2 箇所で 80 個)。
    // `Portal` は既定で `document.body` 直下に出るので、そこを直接見る。
    const pubkey = pubkeyFor(4);
    const { dispose } = mount(
      () => ProfileHover({ pubkey, children: "x" }),
      contextWith(),
    );
    try {
      expect(
        document.body.querySelectorAll('[data-testid="profile-card"]'),
      ).toHaveLength(0);
    } finally {
      dispose();
    }
  });

  it("asChild を渡すと既存の要素そのものがトリガーになる (包む要素を挟まない)", () => {
    // 捕まえる変異: asChild を無視して常に children を包む要素を描く。
    // `Avatar` はこの経路で `sticky top-0` の枠自身をトリガーにしている
    // (仕様 5.1 節) —— 包む要素が挟まると sticky が効かなくなる。
    const pubkey = pubkeyFor(3);
    const { trigger, dispose } = mount(
      () =>
        ProfileHover({
          pubkey,
          asChild: (triggerProps) => (
            <span
              {...(triggerProps() as unknown as JSX.HTMLAttributes<HTMLSpanElement>)}
              data-testid="existing-element"
            >
              own element
            </span>
          ),
        }),
      contextWith(),
    );
    try {
      const el = trigger();
      expect(el.dataset.testid).toBe("existing-element");
      expect(el.dataset.scope).toBe("hover-card");
      expect(el.dataset.part).toBe("trigger");
      expect(el.tagName).toBe("SPAN");
    } finally {
      dispose();
    }
  });
});
