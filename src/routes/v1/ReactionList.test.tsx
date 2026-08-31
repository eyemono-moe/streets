import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import { encodeBech32 } from "../../core/nostr/nip19";
import type { EngagementRequests } from "../../core/read/engagement-requests";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import ReactionList from "./ReactionList";

// `EventStore.put` の `verifyEvent` を通すため、種から鍵を作り schnorr で
// 実署名する。
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
    kind: overrides.kind ?? 1,
    tags: overrides.tags ?? [],
    content: overrides.content ?? "note",
  };
  const id = computeEventId(unsigned);
  return { ...unsigned, id, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
};

/** kind:7 の実署名イベント。既定の content は NIP-25 の `+` (like)。 */
const signedReaction = (
  seed: number,
  targetId: string,
  overrides: Partial<NostrEvent> = {},
): NostrEvent =>
  signed(seed, {
    kind: 7,
    content: "+",
    tags: [["e", targetId]],
    ...overrides,
  });

const fakeEvents = (): EventRequests => ({
  request() {},
  isUnresolved() {
    return false;
  },
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const fakeProfiles = (): ProfileRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

const createRecordingEngagementRequests = (): EngagementRequests & {
  requested: string[];
} => {
  const requested: string[] = [];
  return {
    requested,
    request(id) {
      requested.push(id);
    },
    subscribe() {
      return () => {};
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  };
};

/** listener を後から手で呼べる `EngagementRequests`。本番の `fetchOnce` 解決時の通知を模す。 */
const createControllableEngagementRequests = (): EngagementRequests & {
  requested: string[];
  notify(): void;
} => {
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  return {
    requested,
    request(id) {
      requested.push(id);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      for (const listener of listeners) listener();
    },
    lastBatchSize: 0,
    maxBatchSize: 0,
    dispose() {},
  };
};

const contextWith = (
  store: EventStore,
  engagements: EngagementRequests = createRecordingEngagementRequests(),
  viewerPubkey: string | undefined = undefined,
): RenderContextValue => ({
  store,
  events: fakeEvents(),
  profiles: fakeProfiles(),
  engagements,
  viewerPubkey,
  renderers: [],
});

/** トップレベルが `<Show>` なので、関数として直接呼ぶと戻り値はアクセサ関数になる。 */
const mount = (
  eventId: string,
  ctx: RenderContextValue,
): { element: () => HTMLElement | undefined; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        element = (
          ReactionList({
            eventId,
          }) as unknown as () => HTMLElement | undefined
        )();
        return null;
      },
    });
  });
  return {
    element: () => element,
    dispose: disposeRoot,
  };
};

/** `mount` と違いアクセサを毎回呼び直す (`mount` は初回値を固定し反転を反映しない)。 */
const mountReactive = (
  eventId: string,
  ctx: RenderContextValue,
): { element: () => HTMLElement | undefined; dispose: () => void } => {
  let accessor: (() => HTMLElement | undefined) | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    RenderProvider({
      value: ctx,
      get children() {
        accessor = ReactionList({
          eventId,
        }) as unknown as () => HTMLElement | undefined;
        return null;
      },
    });
  });
  return {
    element: () => accessor?.(),
    dispose: disposeRoot,
  };
};

describe("ReactionList", () => {
  it("リアクションが 0 件なら何も描かない", () => {
    // 捕まえる変異: 空でも枠を描く (0 件の枠が全ノートに並ぶ)
    const store = new EventStore();
    const target = signed(1);
    const { element, dispose } = mount(target.id, contextWith(store));
    try {
      expect(element()).toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("同じ内容がまとまり件数が出る", () => {
    // 捕まえる変異: グループ化せず 1 件 1 枠にする
    const store = new EventStore();
    const target = signed(2);
    store.put(signedReaction(3, target.id), "wss://relay/");
    store.put(signedReaction(4, target.id), "wss://relay/");
    const { element, dispose } = mount(target.id, contextWith(store));
    try {
      const el = element();
      const groups = el?.querySelectorAll('[data-testid="reaction-group"]');
      expect(groups).toHaveLength(1);
      expect(
        groups?.[0]?.querySelector('[data-testid="reaction-count"]')
          ?.textContent,
      ).toBe("2");
    } finally {
      dispose();
    }
  });

  it("マウント時に request(eventId) を呼ぶ", () => {
    // 捕まえる変異: 呼ばない (一覧が永久に空)
    const store = new EventStore();
    const target = signed(5);
    const reactions = createRecordingEngagementRequests();
    const { dispose } = mount(target.id, contextWith(store, reactions));
    try {
      expect(reactions.requested).toContain(target.id);
    } finally {
      dispose();
    }
  });

  it("主経路: マウント後にStoreへ届いたリアクションが通知なしで一覧に現れる", () => {
    // 捕まえる変異: `EventStore.subscribe` を落とす (直接 put が反映されない)。
    const store = new EventStore();
    const target = signed(40);
    const reactions = createControllableEngagementRequests();
    const { element, dispose } = mountReactive(
      target.id,
      contextWith(store, reactions),
    );
    try {
      expect(element()).toBeUndefined();

      // コアレッサの通知を通さず直接 put する (カラム購読/Writer と同じ)。
      store.put(signedReaction(41, target.id), "wss://relay/");

      const el = element();
      expect(el).not.toBeUndefined();
      expect(
        el?.querySelector('[data-testid="reaction-group"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("削除依頼でリアクションを一覧から外し、依頼の巻き戻しで戻す", () => {
    // 捕まえる変異: hide/show を無視する (削除済みが件数と押下状態に残る)。
    const store = new EventStore();
    const target = signed(42);
    const reaction = signedReaction(43, target.id, { created_at: 100 });
    store.put(reaction, "wss://relay/");
    const { element, dispose } = mountReactive(
      target.id,
      contextWith(store, createControllableEngagementRequests()),
    );
    try {
      expect(element()).not.toBeUndefined();
      const deletion = signed(43, {
        kind: 5,
        created_at: 200,
        tags: [["e", reaction.id]],
        content: "delete reaction",
      });

      store.put(deletion, "wss://relay/");
      expect(element()).toBeUndefined();

      store.remove(deletion.id);
      expect(element()).not.toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("グループの数が変わらない変化でも件数は更新される", () => {
    // 捕まえる変異: `equals` を配列長だけの浅い比較にする (2 人目が同じ
    // 絵文字を押してもグループ数は 1 のままなので更新を取りこぼす)。
    const store = new EventStore();
    const target = signed(60);
    const reactions = createControllableEngagementRequests();
    store.put(signedReaction(61, target.id), "wss://relay/");
    const { element, dispose } = mountReactive(
      target.id,
      contextWith(store, reactions),
    );
    try {
      expect(
        element()?.querySelector('[data-testid="reaction-count"]')?.textContent,
      ).toBe("1");

      store.put(signedReaction(62, target.id), "wss://relay/");
      reactions.notify();

      const groups = element()?.querySelectorAll(
        '[data-testid="reaction-group"]',
      );
      expect(groups?.length).toBe(1);
      expect(
        element()?.querySelector('[data-testid="reaction-count"]')?.textContent,
      ).toBe("2");
    } finally {
      dispose();
    }
  });

  it("展開すると押した人が出る", () => {
    // 捕まえる変異: 展開しても何も変わらない
    const store = new EventStore();
    const target = signed(6);
    const reactorSeed = 7;
    store.put(signedReaction(reactorSeed, target.id), "wss://relay/");
    const { element, dispose } = mount(target.id, contextWith(store));
    try {
      const el = element();
      expect(el).toBeDefined();
      expect(el?.querySelector('[data-testid="profile"]')).toBeNull();

      // delegated event が document 経由で拾われるため実 DOM に接続する。
      if (el) document.body.appendChild(el);
      try {
        el?.querySelector<HTMLButtonElement>(
          '[data-testid="reaction-expand"]',
        )?.click();

        const profile = el?.querySelector('[data-testid="profile"]');
        expect(profile).not.toBeNull();
        expect(profile?.textContent).toBe(
          `@${encodeBech32("npub", pubkeyFor(reactorSeed)).slice(0, 12)}`,
        );
      } finally {
        el?.remove();
      }
    } finally {
      dispose();
    }
  });

  it("このノートを NIP-10 の祖先として並べているだけの kind:7 (実際の対象は別イベント) はリアクション数に混ざらない", () => {
    // 捕まえる変異: targetId の一致で絞る処理を外す (祖先として並ぶだけの
    // 別対象への kind:7 まで拾う)。
    const store = new EventStore();
    const target = signed(10);
    const otherTarget = signed(11);
    // kind チェックで落ちるはずだが、無関係な e タグ持ちの入口として仕込む。
    store.put(
      signed(12, { kind: 1, tags: [["e", target.id]], content: "reply" }),
      "wss://relay/",
    );
    // 対象 (最後の e タグ) は otherTarget、target は祖先として先に並ぶだけ。
    store.put(
      signed(13, {
        kind: 7,
        content: "+",
        tags: [
          ["e", target.id, "", "root"],
          ["e", otherTarget.id, "", ""],
        ],
      }),
      "wss://relay/",
    );
    const { element, dispose } = mount(target.id, contextWith(store));
    try {
      expect(element()).toBeUndefined();
    } finally {
      dispose();
    }
  });

  it("自分が押していれば枠を強調する (viewerPubkey が users に含まれるとき)", () => {
    // 捕まえる変異: viewerPubkey を見ない (常に強調しない/常に強調する)
    const store = new EventStore();
    const target = signed(20);
    const viewerSeed = 21;
    const otherSeed = 22;
    const viewerPubkey = pubkeyFor(viewerSeed);
    store.put(signedReaction(otherSeed, target.id), "wss://relay/");

    const notViewer = mount(
      target.id,
      contextWith(store, createRecordingEngagementRequests(), undefined),
    );
    try {
      const group = notViewer
        .element()
        ?.querySelector('[data-testid="reaction-group"]');
      expect(group?.className ?? "").not.toContain("bg-accent-5/10");
    } finally {
      notViewer.dispose();
    }

    // 同じグループへ viewer 自身の分を足す (押した人だけが増える)。
    store.put(signedReaction(viewerSeed, target.id), "wss://relay/");
    const asViewer = mount(
      target.id,
      contextWith(store, createRecordingEngagementRequests(), viewerPubkey),
    );
    try {
      const group = asViewer
        .element()
        ?.querySelector('[data-testid="reaction-group"]');
      expect(group?.className ?? "").toContain("bg-accent-5/10");
    } finally {
      asViewer.dispose();
    }
  });

  it("text リアクションの枠は title で反応内容を持つ (truncate された長文をホバーで読める)", () => {
    const store = new EventStore();
    const target = signed(35);
    store.put(
      signedReaction(36, target.id, { content: "a fairly long text reaction" }),
      "wss://relay/",
    );
    const { element, dispose } = mount(target.id, contextWith(store));
    try {
      const group = element()?.querySelector('[data-testid="reaction-group"]');
      expect(group?.getAttribute("title")).toBe("a fairly long text reaction");
    } finally {
      dispose();
    }
  });

  it("リアクションチップのクリックを親ノートへ伝播させない", () => {
    const store = new EventStore();
    const target = signed(37);
    store.put(signedReaction(38, target.id), "wss://relay/");
    const { element, dispose } = mount(target.id, contextWith(store));
    const parent = document.createElement("div");
    const onParentClick = vi.fn();
    // Solid の onClick は document 委譲なので親側も同じ経路に載せる。
    (
      parent as HTMLElement & {
        $$click?: (event: MouseEvent) => void;
      }
    ).$$click = onParentClick;
    const list = element();
    if (list) parent.appendChild(list);
    document.body.appendChild(parent);
    try {
      parent
        .querySelector<HTMLElement>('[data-testid="reaction-group"]')
        ?.click();

      // 捕まえる変異: stopPropagation を外す (親のスレッド遷移も発火する)。
      expect(onParentClick).not.toHaveBeenCalled();
    } finally {
      parent.remove();
      dispose();
    }
  });

  it("カスタム絵文字はグループ化を経ても <img> で出る", () => {
    // groupReactions → ReactionMark の経路が絵文字を正しく描けることを
    // 直接確かめる。
    const store = new EventStore();
    const target = signed(30);
    store.put(
      signedReaction(31, target.id, {
        content: ":partyparrot:",
        tags: [
          ["e", target.id],
          ["emoji", "partyparrot", "https://example.com/pp.png"],
        ],
      }),
      "wss://relay/",
    );
    const { element, dispose } = mount(target.id, contextWith(store));
    try {
      const img = element()?.querySelector<HTMLImageElement>(
        '[data-testid="reaction-emoji"]',
      );
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("https://example.com/pp.png");
      expect(img?.getAttribute("alt")).toBe("partyparrot");
    } finally {
      dispose();
    }
  });

  it("中身が変わらない通知を 2 回受けても、枠の DOM 要素は作り直されない", () => {
    // 捕まえる変異: `createMemo` から `equals` を外す (無関係な通知でも
    // 全枠を作り直し、絵文字が点滅する)。
    const store = new EventStore();
    const target = signed(60);
    store.put(signedReaction(61, target.id), "wss://relay/");
    const reactions = createControllableEngagementRequests();
    const { element, dispose } = mountReactive(
      target.id,
      contextWith(store, reactions),
    );
    try {
      const before = element()?.querySelector('[data-testid="reaction-group"]');
      expect(before).not.toBeNull();

      // 中身は変わらず、他ノート到着などで通知だけ来る想定。
      reactions.notify();

      const after = element()?.querySelector('[data-testid="reaction-group"]');
      expect(after).toBe(before);
    } finally {
      dispose();
    }
  });
});
