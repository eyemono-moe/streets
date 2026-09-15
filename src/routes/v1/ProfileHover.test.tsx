import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { type JSX, createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
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

const fakeReactions = (): EngagementRequests => ({
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
  engagements: fakeReactions(),
  viewerPubkey: undefined,
  renderers: [],
});

/**
 * `HoverCard.Root` は DOM ノードを持たず、直接呼ぶと memo 関数が返る。
 * `<Portal>` が並ぶため解決先は配列になるので、トリガー要素だけを取り出す。
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

  it("トリガーは bg-transparent で UA 既定の背景を打ち消し、押せる見た目を持つ", () => {
    // 捕まえる変異: `bg-transparent` を落とす (UnoCSS リセットは背景を
    // 打ち消さないので UA 既定の ButtonFace が名前の背後に出る)。
    //
    // `cursor-pointer`/`hover:underline` は意図して付けている —— 押しても
    // 今は何も起きないが、将来押せる挙動にする予定なので見た目を分けない。
    const pubkey = pubkeyFor(2);
    const { trigger, dispose } = mount(
      () => ProfileHover({ pubkey, children: "x" }),
      contextWith(),
    );
    try {
      const className = trigger().className ?? "";
      expect(className).toMatch(/(?:^|\s)bg-transparent(?:\s|$)/);
      expect(className).toMatch(/(?:^|\s)appearance-none(?:\s|$)/);
      expect(className).toMatch(/(?:^|\s)cursor-pointer(?:\s|$)/);
      // 名前は本文の途中にも埋まるので折り返せないと行が溢れる。
      expect(className).toMatch(/(?:^|\s)break-anywhere(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("ホバー前は profile-card (HoverCard.Content) を document.body へ一切マウントしない", () => {
    // 捕まえる変異: `lazyMount`/`unmountOnExit` を外す (ark-ui 5.38.1 の
    // `usePresence` は `unmounted` を常に false にし、`ProfileCard` が
    // hidden 属性だけで常時マウントされる)。Portal は document.body 直下。
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
    // 捕まえる変異: asChild を無視して常に children を包む (Avatar の
    // sticky top-0 は包む要素が挟まると効かなくなる)。
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
