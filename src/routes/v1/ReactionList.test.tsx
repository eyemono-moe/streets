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
import ReactionList from "./ReactionList";

// Note.test.tsx / event-store.test.ts と同じ手法: 種から 32 byte 鍵を作り
// schnorr で実署名する。`EventStore.put` は `verifyEvent` を通すため、
// テスト用イベントも本物の署名を持たなければ store に入らない。
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

/** `request` の呼び出しを記録する `EngagementRequests` のテストダブル。 */
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

/**
 * `subscribe` で受け取った listener を後から手で呼べる `EngagementRequests`
 * のテストダブル。主経路 (取得 → 通知 → 再描画) を検証するテストが使う ——
 * 本番では `fetchOnce` が解決したときにコアレッサがこの listener を呼ぶ
 * (`engagement-requests.ts` の `flush`)。
 */
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

/**
 * `Reaction.test.tsx` の `mountBody` と同じ理由: `ReactionList` のトップ
 * レベルは `<Show>` なので、コンポーネントを関数として直接呼ぶと戻り値は
 * DOM ノードではなくアクセサ関数になる。
 */
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

/**
 * `mount` と違い、`<Show>` のアクセサを毎回呼び直す。`mount` は初回の値を
 * 1 度だけ読んで変数へ固定するので、マウント後に信号が変わって `<Show>`
 * の判定が反転しても (未描画 → 描画) 反映されない。マウント後の到着を
 * 検証するテストはこちらを使う。
 */
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
    // 捕まえる変異: `EventStore.subscribe` を落とし、コアレッサのバッチ通知
    // だけに戻す。カラム購読や Writer から直接 Store へ入った Like が、
    // 次の取得バッチまで一覧へ現れない。
    const store = new EventStore();
    const target = signed(40);
    const reactions = createControllableEngagementRequests();
    const { element, dispose } = mountReactive(
      target.id,
      contextWith(store, reactions),
    );
    try {
      // マウント時点では store にリアクションが無く、一覧は出ていない。
      expect(element()).toBeUndefined();

      // カラム購読や Writer と同じく、コアレッサの通知を通さず直接 put する。
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

  it("グループの数が変わらない変化でも件数は更新される", () => {
    // 捕まえる変異: `groups` の `equals` を「配列の長さが同じなら等しい」
    // のような浅い比較にする。枠の作り直しを抑える等値関数は、抑えすぎると
    // 逆に画面が更新されなくなる —— 2 人目が同じ絵文字を押してもグループ
    // 数は 1 のままなので、長さだけを見る比較ではこの変化を取りこぼす。
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
      // 展開前は誰が押したかを出さない。
      expect(el?.querySelector('[data-testid="profile"]')).toBeNull();

      // クリックは document への bubble を経由して Solid の delegated event
      // で拾われるため、実 DOM に接続する (Note.test.tsx の展開ボタンの
      // テストと同じ理由)。
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
    // 捕まえる変異: targetId の一致で絞る処理を外す。`eventsByTag("e", id)`
    // は「この id を e タグに持つイベント」を返すので、返信 (kind:1) だけで
    // なく、このノートをスレッド祖先として並べる別対象への kind:7 まで
    // 拾ってしまう。
    const store = new EventStore();
    const target = signed(10);
    const otherTarget = signed(11);
    // 素朴な返信。kind チェックだけで落ちるはずだが、「e タグを持つ無関係な
    // イベント」の入口として仕込む。
    store.put(
      signed(12, { kind: 1, tags: [["e", target.id]], content: "reply" }),
      "wss://relay/",
    );
    // 対象 (最後の e タグ) は otherTarget —— target は祖先として先に並ぶだけ。
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

    // 同じグループへ viewer 自身の分を足す (グループの中身は変わらず、
    // 誰が押したかだけが増える)。
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

  it("カスタム絵文字はグループ化を経ても <img> で出る", () => {
    // C2 の統合後も、グループ化された経路 (groupReactions → ReactionMark)
    // が絵文字を正しく描けることを直接確かめる (Reaction.test.tsx は
    // ReactionFull/Compact の見出し経路しか通らない)。
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
    // 捕まえる変異: `groups` の `createMemo` から `equals` オプションを
    // 外す。集計 (`groupReactions`) は毎回新しい配列・新しいオブジェクトを
    // 返すので、`equals` が無いと「マウント中のどれかのノートにリアクション
    // が届いた」という無関係な通知のたびに `<For>` が参照同一性で全ての
    // 枠を作り直す。副作用として `ReactionMark` の「画像が壊れた」フラグが
    // 毎回リセットされ、404 のカスタム絵文字が通知のたびに点滅する。
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

      // 中身は変わらないまま、他のノートの到着などで通知だけ来る想定。
      reactions.notify();

      const after = element()?.querySelector('[data-testid="reaction-group"]');
      expect(after).toBe(before);
    } finally {
      dispose();
    }
  });
});
