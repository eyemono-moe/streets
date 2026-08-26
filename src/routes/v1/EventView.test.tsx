import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../../core/nostr/event";
import type { EventRequests } from "../../core/read/event-requests";
import { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { ReactionRequests } from "../../core/read/reaction-requests";
import { RenderProvider } from "../../core/view/render-context";
import type { RenderContextValue } from "../../core/view/render-context";
import type { EventRenderer } from "../../core/view/renderer-registry";
import EventView from "./EventView";
import type { EventViewProps } from "./EventView";
import { type MuteList, MuteListProvider } from "./mute-list";

// subscription-manager.test.ts / profile-requests.test.ts と同じ手法:
// 種から 32 byte 鍵を作り schnorr で実署名する。`EventStore.put` は
// `verifyEvent` (id 再計算 + schnorr 検証) を通すため、テスト用イベントも
// 本物の署名を持たなければ store に入らない。
const keyFor = (seed: number) =>
  Uint8Array.from(
    Array.from({ length: 32 }, (_, i) => ((seed + i * 7) % 255) + 1),
  );

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

/**
 * `EventRequests` のテストダブル。`createEventRequests` の 200ms バッチ窓や
 * `fetchOnce` を経由せず、`request`/`subscribe` の呼ばれ方とバッチ完了の
 * タイミングをテストが直接制御する。
 */
const createFakeEventRequests = () => {
  const requested: string[] = [];
  const listeners = new Set<() => void>();
  const unresolvedIds = new Set<string>();
  const events: EventRequests = {
    request(id) {
      requested.push(id);
    },
    isUnresolved(id) {
      return unresolvedIds.has(id);
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
    events,
    requested,
    /** バッチが 1 本片付いたことを模す (`EventRequests.subscribe` の通知)。 */
    settle: () => {
      for (const listener of [...listeners]) listener();
    },
    markUnresolved: (id: string) => unresolvedIds.add(id),
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

const fakeReactions = (): ReactionRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

/** kind:1 だけを扱うダミーレンダラ。full/compact を DOM 上で区別できるようにする。 */
const testRenderer: EventRenderer = {
  kind: 1,
  full: (props) => (
    <div data-testid="test-renderer-full">{props.event.content}</div>
  ),
  compact: (props) => (
    <div data-testid="test-renderer-compact">{props.event.content}</div>
  ),
};

/**
 * `src/routes/debug/v1-core.test.tsx` と同じ手法: Solid コンポーネントを
 * JSX を介さず関数として直接呼び、返ってきた DOM ノードを検証する。
 * `EventView` は内部で `createEffect` を使うため、初回の副作用実行は
 * マウント直後の同期コードより後 (マイクロタスク) に走る —— 呼び出し側は
 * `vi.waitFor` で結果を待つ (`Profile.tsx`/`use-profile.test.tsx` と同じ理由)。
 */
const mount = (
  props: EventViewProps,
  ctx: RenderContextValue,
  muteList?: MuteList,
): { element: () => HTMLElement; dispose: () => void } => {
  let element: HTMLElement | undefined;
  let disposeRoot: () => void = () => {};
  createRoot((dispose) => {
    disposeRoot = dispose;
    const render = () =>
      RenderProvider({
        value: ctx,
        get children() {
          element = EventView(props) as unknown as HTMLElement;
          return null;
        },
      });
    if (muteList) {
      MuteListProvider({
        value: muteList,
        get children() {
          return render();
        },
      });
    } else {
      render();
    }
  });
  return {
    element: () => {
      if (!element) throw new Error("EventView did not mount");
      return element;
    },
    dispose: disposeRoot,
  };
};

describe("EventView", () => {
  it("ミュートリストが確定するまでキャッシュ済み本文を露出しない", async () => {
    const store = new EventStore();
    const cached = signed(30, { content: "must stay hidden" });
    store.put(cached, "wss://relay/");
    const fake = createFakeEventRequests();
    const muteList: MuteList = {
      state: () => ({ phase: "loading" }),
      saving: () => false,
      error: () => undefined,
      refresh: async () => {},
      matches: () => [],
      add: async () => {},
      remove: async () => {},
      move: async () => {},
    };
    const { element, dispose } = mount(
      { id: cached.id, variant: "compact" },
      {
        store,
        events: fake.events,
        profiles: fakeProfiles(),
        reactions: fakeReactions(),
        viewerPubkey: undefined,
        renderers: [testRenderer],
      },
      muteList,
    );
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: loading を空リストとみなし、通常本文を先に描く。
        expect(
          element().querySelector('[data-testid="mute-list-pending"]'),
        ).not.toBeNull();
        expect(
          element().querySelector('[data-testid="test-renderer-compact"]'),
        ).toBeNull();
      });
    } finally {
      dispose();
    }
  });

  it("入れ子のミュートを一時表示し、該当項目を解除できる", async () => {
    const store = new EventStore();
    const muted = signed(31, { content: "hidden" });
    store.put(muted, "wss://relay/");
    const fake = createFakeEventRequests();
    const entry = {
      target: { type: "pubkey" as const, value: muted.pubkey },
      visibility: "private" as const,
    };
    const remove = vi.fn(async () => {
      throw new Error("rejected");
    });
    const muteList: MuteList = {
      state: () => ({
        phase: "ready",
        entries: [entry],
        privatePart: "ready",
      }),
      saving: () => false,
      error: () => "署名が拒否されました",
      refresh: async () => {},
      matches: () => [entry],
      add: async () => {},
      remove,
      move: async () => {},
    };
    const ctx: RenderContextValue = {
      store,
      events: fake.events,
      profiles: fakeProfiles(),
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [testRenderer],
    };
    const { element, dispose } = mount(
      { id: muted.id, variant: "compact" },
      ctx,
      muteList,
    );
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: MuteList を見ずに通常レンダラを描く。
        expect(
          element().querySelector('[data-testid="muted-event"]'),
        ).not.toBeNull();
        expect(
          element().querySelector('[data-testid="test-renderer-compact"]'),
        ).toBeNull();
      });
      document.body.append(element());
      (
        element().querySelector(
          '[data-testid="muted-event-remove"]',
        ) as HTMLButtonElement
      ).click();
      expect(remove).toHaveBeenCalledWith(entry);
      await vi.waitFor(() => {
        // 捕まえる変異: 解除の reject を捨て、ユーザーへ失敗を表示しない。
        expect(
          element().querySelector('[data-testid="muted-event-error"]')
            ?.textContent,
        ).toBe("署名が拒否されました");
      });

      (
        element().querySelector(
          '[data-testid="muted-event-show"]',
        ) as HTMLButtonElement
      ).click();
      await vi.waitFor(() => {
        expect(
          element().querySelector('[data-testid="test-renderer-compact"]')
            ?.textContent,
        ).toBe("hidden");
      });
    } finally {
      element().remove();
      dispose();
    }
  });
  it("store に既にあれば要求せず、登録済みレンダラで描く", async () => {
    const store = new EventStore();
    const event = signed(1, { content: "already here" });
    store.put(event, "wss://relay/");
    const fake = createFakeEventRequests();
    const ctx: RenderContextValue = {
      store,
      events: fake.events,
      profiles: fakeProfiles(),
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [testRenderer],
    };

    const { element, dispose } = mount({ id: event.id, variant: "full" }, ctx);
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: store にあっても常に要求する (無駄な REQ を作る)
        expect(fake.requested).toEqual([]);
        expect(
          element().querySelector('[data-testid="test-renderer-full"]')
            ?.textContent,
        ).toBe("already here");
      });
      // 捕まえる変異: data-variant を出さない/固定値にする
      expect(element().dataset.variant).toBe("full");
    } finally {
      dispose();
    }
  });

  it("store に無ければ要求して待ち、届いたら描画する", async () => {
    const store = new EventStore();
    const event = signed(2, { content: "arrived later" });
    const fake = createFakeEventRequests();
    const ctx: RenderContextValue = {
      store,
      events: fake.events,
      profiles: fakeProfiles(),
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [testRenderer],
    };

    const { element, dispose } = mount({ id: event.id, variant: "full" }, ctx);
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: store に無くても要求しない (取得が一切発行されない)
        expect(fake.requested).toEqual([event.id]);
        expect(
          element().querySelector('[data-testid="event-loading"]'),
        ).not.toBeNull();
      });

      // バッチが片付く前にイベントが store に届く (isUnresolved 側の分岐を
      // 経由せず check() だけで解決する経路)。
      store.put(event, "wss://relay/");
      fake.settle();

      await vi.waitFor(() => {
        expect(
          element().querySelector('[data-testid="test-renderer-full"]')
            ?.textContent,
        ).toBe("arrived later");
        expect(
          element().querySelector('[data-testid="event-loading"]'),
        ).toBeNull();
      });
    } finally {
      dispose();
    }
  });

  it("isUnresolved が真になったら「読み込めませんでした」を出す", async () => {
    const store = new EventStore();
    const missingId = signed(3).id;
    const fake = createFakeEventRequests();
    const ctx: RenderContextValue = {
      store,
      events: fake.events,
      profiles: fakeProfiles(),
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [testRenderer],
    };

    const { element, dispose } = mount({ id: missingId, variant: "full" }, ctx);
    try {
      await vi.waitFor(() => {
        expect(fake.requested).toEqual([missingId]);
      });

      // store には届かないまま、バッチだけが片付く。
      fake.markUnresolved(missingId);
      fake.settle();

      await vi.waitFor(() => {
        // 捕まえる変異: isUnresolved を見ない (「読み込み中」のまま止まり、
        // 取得中と取得失敗の区別が付かなくなる)
        expect(
          element().querySelector('[data-testid="event-unresolved"]'),
        ).not.toBeNull();
        expect(
          element().querySelector('[data-testid="event-loading"]'),
        ).toBeNull();
      });
    } finally {
      dispose();
    }
  });

  it("無関係なバッチの完了では失敗へ倒さない", async () => {
    const store = new EventStore();
    const event = signed(4, { content: "waiting" });
    const otherId = signed(5).id;
    const fake = createFakeEventRequests();
    const ctx: RenderContextValue = {
      store,
      events: fake.events,
      profiles: fakeProfiles(),
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      renderers: [testRenderer],
    };

    const { element, dispose } = mount({ id: event.id, variant: "full" }, ctx);
    try {
      await vi.waitFor(() => {
        expect(fake.requested).toEqual([event.id]);
      });

      // 自分の id 以外が unresolved になった状態でバッチ完了を通知する。
      //
      // 捕まえる変異: `subscribe` のコールバックで `isUnresolved(id)` を
      // 確かめずに `setUnresolved(true)` する。コアレッサは id 単位では
      // 通知しない (無関係なバッチの完了でも呼ばれる) ので、確かめずに
      // 倒すと、**他人の取得が終わっただけで自分が「読み込めませんでした」
      // に変わる**。引用先が 1 つでも見つからないカラムでは、まだ探して
      // いる最中の他の引用先が軒並み失敗表示になる。
      //
      // (初版のコメントは「この シナリオを直接崩す変異は無い」と書いて
      // いたが、レビューで実際に上の変異を入れたところ本テストだけが
      // 落ちた。変異が無いという主張のほうが誤りだった。)
      fake.markUnresolved(otherId);
      fake.settle();

      expect(
        element().querySelector('[data-testid="event-loading"]'),
      ).not.toBeNull();
      expect(
        element().querySelector('[data-testid="event-unresolved"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });

  it("未登録の kind でも、レンダラ集合が空でも fallback を描く", async () => {
    const store = new EventStore();
    const event = signed(6, { kind: 9999, content: "x" });
    store.put(event, "wss://relay/");
    const fake = createFakeEventRequests();
    const ctx: RenderContextValue = {
      store,
      events: fake.events,
      profiles: fakeProfiles(),
      reactions: fakeReactions(),
      viewerPubkey: undefined,
      // 空集合でも壊れないことがこのタスクの要求そのもの。
      renderers: [],
    };

    const { element, dispose } = mount(
      { id: event.id, variant: "compact" },
      ctx,
    );
    try {
      await vi.waitFor(() => {
        // 捕まえる変異: renderer が見つからない (未登録 kind) ときに
        // UnknownKind へ倒さず何も描かない
        // (検証済み: `renderer ? ... : UnknownKindXxx` の fallback 分岐を
        // `undefined` に変えて「見つからなければ何も描画しない」にすると、
        // この 1 本だけが落ち、他 4 本は通る)
        const fallback = element().querySelector(
          '[data-testid="unknown-kind"]',
        );
        expect(fallback).not.toBeNull();
        expect(fallback?.textContent).toContain("9999");
      });
      expect(element().dataset.variant).toBe("compact");
    } finally {
      dispose();
    }
  });
});
