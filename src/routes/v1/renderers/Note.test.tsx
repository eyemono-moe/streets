import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { createRoot } from "solid-js";
import type { Component } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { type NostrEvent, computeEventId } from "../../../core/nostr/event";
import { encodeBech32 } from "../../../core/nostr/nip19";
import type { EventRequests } from "../../../core/read/event-requests";
import { EventStore } from "../../../core/read/event-store";
import type { ProfileRequests } from "../../../core/read/profile-requests";
import type { ReactionRequests } from "../../../core/read/reaction-requests";
import { formatEventTimeFull } from "../../../core/view/format-time";
import { RenderProvider } from "../../../core/view/render-context";
import type { RenderContextValue } from "../../../core/view/render-context";
import type { EventBodyProps } from "../../../core/view/renderer-registry";
import { NoteCompact, NoteFull } from "./Note";

// EventView.test.tsx / profile-requests.test.ts と同じ手法: 種から 32 byte
// 鍵を作り schnorr で実署名する。
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

/**
 * `EventRequests` のテストダブル。`request` の呼び出しを記録するだけ ——
 * Step 2 の「compact は要求しない」を直接主張するのに必要な最小限。
 */
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

const fakeReactions = (): ReactionRequests => ({
  request() {},
  subscribe() {
    return () => {};
  },
  lastBatchSize: 0,
  maxBatchSize: 0,
  dispose() {},
});

/**
 * `EventView.test.tsx` と同じ手法: `createRoot` の中で Solid コンポーネント
 * を JSX を介さず関数として直接呼び、返ってきた DOM ノードを検証する。
 */
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

const contextWith = (
  events: EventRequests,
  store: EventStore = new EventStore(),
): RenderContextValue => ({
  store,
  events,
  profiles: fakeProfiles(),
  reactions: fakeReactions(),
  viewerPubkey: undefined,
  // kind:1 しかテスト対象にしないので、レンダラ集合は空でよい (引用・返信
  // 先は常に compact の EventView 経由で描かれ、store に無い間は
  // event-loading のまま — renderer の解決まで届かない)。
  renderers: [],
});

describe("NoteFull", () => {
  it("著者・本文・時刻を出す (旧 Note.tsx と同じ見た目)", () => {
    // 捕まえる変異: note-author/note-content/note-created-at のいずれかを
    // 落とす、または data-testid="note" を外す
    const events = createRecordingEventRequests();
    const event = signed(1, { content: "hello world", created_at: 42 });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.dataset.testid).toBe("note");
      expect(
        el.querySelector('[data-testid="note-content"]')?.textContent,
      ).toBe("hello world");
      // created_at=42 は 1970 年 (実行時の「今年」とは別年になる) ——
      // 別年のとき formatEventTime と formatEventTimeFull は同じ書式
      // (yyyy/MM/dd HH:mm) を返すので、「今」の値に依存せず厳密な文字列を
      // 主張できる。
      // 捕まえる変異: 生の event.created_at をそのまま出す (spec 3 節の
      // 短縮絶対値書式を経由しない、旧 Note.tsx の挙動への後退)
      const formatted = formatEventTimeFull(new Date(42 * 1000));
      const createdAt = el.querySelector('[data-testid="note-created-at"]');
      expect(createdAt?.textContent).toBe(formatted);
      // 捕まえる変異: title 属性 (完全な日時) を付けない
      expect(createdAt?.getAttribute("title")).toBe(formatted);
      expect(el.querySelector('[data-testid="note-author"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("著者行は display_name と @name の 2 段 (v0 の EventBase と同じ)", () => {
    // 捕まえる変異: 名前を 1 つしか出さない (v0 は太字の display_name と
    // 副次的な @name を並べる —— 表示名だけでは同名の別人を見分けられず、
    // @name だけでは本人が名乗っている表示名が消える)
    const events = createRecordingEventRequests();
    const event = signed(11, { content: "hi" });
    const store = new EventStore();
    store.put(
      signed(11, {
        kind: 0,
        content: JSON.stringify({ name: "handle", display_name: "表示名" }),
      }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events, store),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      // profile-name には display_name だけが入る (e2e が完全一致で拾う)
      expect(
        author?.querySelector('[data-testid="profile-name"]')?.textContent,
      ).toBe("表示名");
      expect(author?.textContent).toBe("表示名@handle");
    } finally {
      dispose();
    }
  });

  it("display_name が無ければ name を太字側へ回し、@name を重ねない", () => {
    // 捕まえる変異: display_name の欠落時に太字側を空にしたまま @name を
    // 出す (v0 の素朴な写しだと空の太字が残る) / 太字側の縮退と @name の
    // 両方を出して同じ文字列が 2 度並ぶ
    const events = createRecordingEventRequests();
    const event = signed(12, { content: "hi" });
    const store = new EventStore();
    store.put(
      signed(12, { kind: 0, content: JSON.stringify({ name: "handle" }) }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events, store),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      expect(author?.textContent).toBe("handle");
    } finally {
      dispose();
    }
  });

  it("プロフィール未取得の著者は npub の先頭 12 文字", () => {
    // 捕まえる変異: 生 hex の短縮を出す (spec 3 節は npub 形を求める ——
    // hex は貼っても他クライアントで開けない)
    const events = createRecordingEventRequests();
    const event = signed(13, { content: "hi" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      expect(author?.textContent).toBe(
        encodeBech32("npub", event.pubkey).slice(0, 12),
      );
    } finally {
      dispose();
    }
  });

  it("reply の pubkey があれば reply-to を即座に出す (親の到着を待たない)", () => {
    // 捕まえる変異: reply-to を出さない、または EventView (親の compact) を
    // 描かない
    const events = createRecordingEventRequests();
    const parentId = signed(2).id;
    const replierPubkey = pubkeyFor(3);
    const event = signed(4, {
      tags: [["e", parentId, "wss://relay/", "reply", replierPubkey]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      const replyTo = el.querySelector('[data-testid="reply-to"]');
      expect(replyTo).not.toBeNull();
      // pubkey は届く前でも短縮表示で即座に出る (Profile.tsx の縮退)。
      // 捕まえる変異: 生 hex をそのまま出す (spec 3 節が求めるのは npub の
      // 先頭 12 文字)
      expect(replyTo?.textContent).toContain(
        `@${encodeBech32("npub", replierPubkey).slice(0, 12)}`,
      );
      expect(replyTo?.textContent).not.toContain(replierPubkey);
      // 親そのものは compact の EventView として続けて描かれる。
      const parent = el.querySelector(
        '[data-testid="event-view"][data-variant="compact"]',
      );
      expect(parent).not.toBeNull();
      // 捕まえる変異: 返信先を引用と同じ枠 (`NestedEventCard`) に入れる。
      // 枠は「別の投稿の引用」を意味するので、返信先に付けると引用と
      // 見分けが付かなくなる (Figma の「リプライ表示例」は枠を持たない)。
      expect(parent?.parentElement?.className ?? "").not.toMatch(
        /(?:^|\s)b-\d/,
      );
      // 要求はしている (親の compact 描画自体は要求してよい —— これは
      // full の話であり、compact 側の禁止規則とは無関係)。
      expect(events.requested).toContain(parentId);
    } finally {
      dispose();
    }
  });

  it("返信先には threadLine が届き、引用先には届かない", () => {
    // 捕まえる変異: 返信先の EventView から threadLine を落とす (親が枠も
    // 線も持たない、ただ上に浮いたイベントになり本体との関係が読めない) /
    // 引用の EventView にも threadLine を渡す (別の投稿の引用が「同じ
    // 会話の続き」に見える)
    //
    // 親と引用を store に入れ、**受け取った props を記録するだけの代役**を
    // kind:1 のレンダラとして登録する。store に無いと EventView は
    // 「読み込み中」で止まり、レンダラまで届かないので観測できない。
    // 代役に本物の `NoteCompact` を使わないのは、Solid の DEV 版
    // `createComponent` が渡されたコンポーネント関数自体に印を付けるため
    // —— 本物を通すと、後続のテストが同じ関数を直接呼んだときに戻り値が
    // 要素ではなくメモ関数になる (実測済み)。
    const seen: { id: string; threadLine?: boolean }[] = [];
    const Recorder: Component<EventBodyProps> = (props) => {
      seen.push({ id: props.event.id, threadLine: props.threadLine });
      return null;
    };

    const events = createRecordingEventRequests();
    const parent = signed(7);
    const quoted = signed(8);
    const store = new EventStore();
    store.put(parent, "wss://relay/");
    store.put(quoted, "wss://relay/");
    const event = signed(9, {
      tags: [
        ["e", parent.id, "", "reply"],
        ["q", quoted.id, ""],
      ],
    });
    const { dispose } = mount(() => NoteFull({ event }), {
      ...contextWith(events, store),
      renderers: [{ kind: 1, full: Recorder, compact: Recorder }],
    });
    try {
      expect(seen.find((s) => s.id === parent.id)?.threadLine).toBe(true);
      expect(seen.find((s) => s.id === quoted.id)?.threadLine).toBeFalsy();
    } finally {
      dispose();
    }
  });

  it("reply に pubkey が無ければ reply-to を出さないが、親の EventView は出す", () => {
    // 捕まえる変異: pubkey が無いのに reply-to を出す (存在しない著者名を
    // でっち上げることになる)
    const events = createRecordingEventRequests();
    const parentId = signed(5).id;
    const event = signed(6, {
      tags: [["e", parentId, "", "reply"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="reply-to"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("q タグが無くても本文の nostr: から引用を描く", () => {
    // 捕まえる変異: NoteBody の eventRefs を "text" 固定にする、または
    // MentionToken の note/nevent の embed 分岐を消す。どちらも `q` タグを
    // 付けずに本文へ貼るだけのクライアント (実在する) の引用が、request も
    // compact の EventView も出さずに丸ごと消える。
    const events = createRecordingEventRequests();
    const quoted = signed(32);
    const event = signed(33, {
      content: `見て nostr:${encodeBech32("note", quoted.id)}`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(events.requested).toContain(quoted.id);
      expect(
        element().querySelectorAll(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toHaveLength(1);
    } finally {
      dispose();
    }
  });

  it("q タグ (id 形式) は本文の下に compact の EventView を出す", () => {
    // 捕まえる変異: quoteTargets を呼ばない/描かない
    const events = createRecordingEventRequests();
    const quotedId = signed(7).id;
    const event = signed(8, {
      tags: [["q", quotedId, "wss://relay/"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(events.requested).toContain(quotedId);
      expect(
        element().querySelector(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("q タグが event-address を指すときは「未対応の参照です」を出す", () => {
    // 捕まえる変異: address 形式でも id 形式と同じく EventView (compact) を
    // 描こうとする (id ではなく座標が渡り、EventStore は永久に見つけられない)
    const events = createRecordingEventRequests();
    const event = signed(9, {
      tags: [["q", `30023:${pubkeyFor(10)}:my-article`, "wss://relay/"]],
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(
        el.querySelector('[data-testid="unsupported-ref"]'),
      ).not.toBeNull();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      // address 形式は request の対象にすらならない (id ではないので
      // EventRequests に渡しようが無い)。
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});

describe("引用の置き場所 (仕様 4.1/4.2 節・brief Task4 Step 4/5)", () => {
  it("本文に現れた引用は本文の中に描かれ、最下部には出ない (同じイベントが二重に出ない)", () => {
    // 捕まえる変異: quotes() を quoteTargets に戻す (本文にも埋め込まれ、
    // 最下部にも同じイベントがもう一度出て二重になる)
    const events = createRecordingEventRequests();
    const quoted = signed(60);
    const event = signed(61, {
      tags: [["q", quoted.id, "wss://relay/"]],
      content: `見て nostr:${encodeBech32("note", quoted.id)}`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(
        el.querySelectorAll(
          '[data-testid="event-view"][data-variant="compact"]',
        ),
      ).toHaveLength(1);
      const content = el.querySelector('[data-testid="note-content"]');
      expect(
        content?.querySelector('[data-testid="event-view"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("q タグにしか無い引用は最下部に出る (本文には現れない)", () => {
    // 捕まえる変異: tagOnlyQuoteTargets を空配列にする (タグだけの引用が
    // 画面から丸ごと消える)
    const events = createRecordingEventRequests();
    const quoted = signed(62);
    const event = signed(63, {
      tags: [["q", quoted.id, "wss://relay/"]],
      content: "本文には貼っていない",
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      const content = el.querySelector('[data-testid="note-content"]');
      expect(content?.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="event-view"][data-variant="compact"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });
});

describe("compact は関連イベントを一切要求しない (spec 3 節・brief Step 2)", () => {
  it("引用と返信を両方持つ kind:1 を compact で描いても request は一度も呼ばれない。同じイベントを full で描くと呼ばれる (対照)", () => {
    // 捕まえる変異: compact でも replyTarget/quoteTargets を呼んで
    // <EventView> を描く。これが破れても画面は深くなるだけで動いてしまう
    // ため、ここで直接固定する (brief Step 2 の核心)。
    const parentId = signed(11).id;
    const quotedId = signed(12).id;
    const event = signed(13, {
      tags: [
        ["e", parentId, "wss://relay/", "reply"],
        ["q", quotedId, "wss://relay/"],
      ],
    });

    const compactEvents = createRecordingEventRequests();
    const compactRun = mount(
      () => NoteCompact({ event }),
      contextWith(compactEvents),
    );
    try {
      expect(compactEvents.requested).toEqual([]);
    } finally {
      compactRun.dispose();
    }

    // 対照: 同じイベントを full で描くと (親・引用先の compact 描画を
    // 通じて) request が呼ばれる。この対照が無いと、上のアサーションは
    // 「そもそも何も request しない実装」でも通ってしまう。
    const fullEvents = createRecordingEventRequests();
    const fullRun = mount(() => NoteFull({ event }), contextWith(fullEvents));
    try {
      expect(fullEvents.requested.length).toBeGreaterThan(0);
      expect(fullEvents.requested).toEqual(
        expect.arrayContaining([parentId, quotedId]),
      );
    } finally {
      fullRun.dispose();
    }
  });
});

describe("NoteCompact", () => {
  it("著者・本文・時刻のみを出す (reply-to/unsupported-ref/event-view を出さない)", () => {
    // 捕まえる変異: compact でも reply-to や引用の EventView を描く
    const events = createRecordingEventRequests();
    const parentId = signed(14).id;
    const quotedId = signed(15).id;
    const event = signed(16, {
      content: "compact body",
      tags: [
        ["e", parentId, "wss://relay/", "reply", pubkeyFor(17)],
        ["q", quotedId, "wss://relay/"],
      ],
    });
    const { element, dispose } = mount(
      () => NoteCompact({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.dataset.testid).toBe("note");
      expect(
        el.querySelector('[data-testid="note-content"]')?.textContent,
      ).toBe("compact body");
      expect(el.querySelector('[data-testid="reply-to"]')).toBeNull();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(el.querySelector('[data-testid="unsupported-ref"]')).toBeNull();
    } finally {
      dispose();
    }
  });

  it("本文の引用は埋め込まれずテキストになる (compact の規則を守る)", () => {
    // 捕まえる変異: NoteBody の三項を "embed" 固定にする。compact でも
    // 埋め込んでしまうと「compact は関連イベントを一切要求しない」規則が
    // 破れる (返信先・引用先のプレビューの中で、さらに引用が展開される)。
    const events = createRecordingEventRequests();
    const quoted = signed(64);
    const event = signed(65, {
      content: `見て nostr:${encodeBech32("note", quoted.id)}`,
    });
    const { element, dispose } = mount(
      () => NoteCompact({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="event-view"]')).toBeNull();
      expect(el.querySelector('[data-testid="event-ref-text"]')).not.toBeNull();
      expect(events.requested).toEqual([]);
    } finally {
      dispose();
    }
  });
});

describe("アバターの寸法 (spec 3 節)", () => {
  it("full は w-10、compact は w-8 になる", () => {
    // 捕まえる変異: full/compact で同じ寸法クラスを使う (variant を
    // `Avatar` の size prop へ渡し忘れる/固定値にする)
    const events = createRecordingEventRequests();
    const event = signed(20, { content: "x" });

    const fullRun = mount(() => NoteFull({ event }), contextWith(events));
    try {
      const avatar = fullRun.element().querySelector('[data-testid="avatar"]');
      expect(avatar?.className).toContain("w-10");
      expect(avatar?.className).not.toContain("w-8");
    } finally {
      fullRun.dispose();
    }

    const compactRun = mount(() => NoteCompact({ event }), contextWith(events));
    try {
      const avatar = compactRun
        .element()
        .querySelector('[data-testid="avatar"]');
      expect(avatar?.className).toContain("w-8");
      expect(avatar?.className).not.toContain("w-10");
    } finally {
      compactRun.dispose();
    }
  });
});

describe("compact は自分で padding を持たない (spec 3 節・brief の要注意点 1)", () => {
  it("full は padding を持ち、compact は持たない", () => {
    // 捕まえる変異: compact のクラスにも padding を足す。
    // compact は常に引用カード・リポスト・返信先の中に置かれる入れ子であり、
    // 置く側が既に余白を取るため、ここで足すと二重になってガタつく
    // (このモジュールのコメント「次の変更者へ」参照)。
    const events = createRecordingEventRequests();
    const event = signed(25, { content: "x" });

    const fullRun = mount(() => NoteFull({ event }), contextWith(events));
    try {
      expect(fullRun.element().className).toMatch(/(?:^|\s)p[ltrbxy]?-\d/);
    } finally {
      fullRun.dispose();
    }

    const compactRun = mount(() => NoteCompact({ event }), contextWith(events));
    try {
      expect(compactRun.element().className).not.toMatch(/(?:^|\s)p-\d/);
    } finally {
      compactRun.dispose();
    }
  });
});

describe("group/event", () => {
  it("NoteFull の記事要素は group/event を持つ (ホバー判定の祖先)", () => {
    // 捕まえる変異: `group/event` クラスを落とす。`ReactionList` の展開
    // トグルが使う `group-not-hover/event:hidden` は、この名前付き group を
    // 持つ祖先が無いと一切効かず、三角が全ノートで常に出たままになる。
    const events = createRecordingEventRequests();
    const event = signed(50, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(element().className).toMatch(/(?:^|\s)group\/event(?:\s|$)/);
    } finally {
      dispose();
    }
  });

  it("NoteFull の記事要素は group-[_]/event:p-0 を持つ (祖先の group/event の中で padding を潰す)", () => {
    // 捕まえる変異: `group-[_]/event:p-0` クラスを落とす。対象を `full` で
    // 描く (spec 3 節) ようになったことで、リポスト/リアクションの枠の
    // 中にこの記事要素がそのまま入る。このクラスが無いと、置く側
    // (`RepostFull`/`ReactionFull`) の padding と足し合わさって二重になる。
    const events = createRecordingEventRequests();
    const event = signed(53, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(element().className).toMatch(
        /(?:^|\s)group-\[_\]\/event:p-0(?:\s|$)/,
      );
    } finally {
      dispose();
    }
  });
});

describe("リアクション一覧の設置 (spec 5 節・brief Step 4)", () => {
  it("NoteFull はリアクションがあれば reaction-list を出す", () => {
    // 捕まえる変異: NoteFull へ ReactionList を設置し忘れる
    const events = createRecordingEventRequests();
    const event = signed(51, { content: "x" });
    const store = new EventStore();
    store.put(
      signed(52, { kind: 7, tags: [["e", event.id]], content: "+" }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events, store),
    );
    try {
      expect(
        element().querySelector('[data-testid="reaction-list"]'),
      ).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("NoteCompact はリアクションがあっても reaction-list を出さない", () => {
    // 捕まえる変異: NoteCompact にも ReactionList を設置する。compact が
    // 関連イベントを一切要求しない規則 (このファイルの他のテストと同じ)
    // に、リアクション取得の要求も含まれる。
    const events = createRecordingEventRequests();
    const event = signed(53, { content: "x" });
    const store = new EventStore();
    store.put(
      signed(54, { kind: 7, tags: [["e", event.id]], content: "+" }),
      "wss://relay/",
    );
    const { element, dispose } = mount(
      () => NoteCompact({ event }),
      contextWith(events, store),
    );
    try {
      expect(
        element().querySelector('[data-testid="reaction-list"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });
});

describe("本文が空のとき本文の器を出さない (design 6 節)", () => {
  it("content が空文字列なら note-content を描かない (骨格は残る)", () => {
    // 捕まえる変異: 空でも常に NoteContent (note-content) を描く
    const events = createRecordingEventRequests();
    const event = signed(21, { content: "" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const el = element();
      expect(el.querySelector('[data-testid="note-content"]')).toBeNull();
      // 骨格 (アバター・著者) 自体は残る —— 本文が無いだけで行ごと消える
      // わけではない
      expect(el.querySelector('[data-testid="avatar"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="note-author"]')).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("空白だけの本文も「空」として扱う", () => {
    // 捕まえる変異: 空文字列だけを見て trim しない (空白だけの本文で
    // 見た目には何も無い note-content の器が残る)
    const events = createRecordingEventRequests();
    const event = signed(22, { content: "   \n  " });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      expect(
        element().querySelector('[data-testid="note-content"]'),
      ).toBeNull();
    } finally {
      dispose();
    }
  });
});

/** `getBoundingClientRect` が返す高さを差し替える (`createElementSize` が
 * `ResizeObserver` の発火を待たず、ref 到着時にこれを同期的に一度読む —
 * `vitest.setup.ts` のコメント参照)。DOMRect 全体を満たす必要は無いが、
 * 型を通すためのダミー値を並べる。
 */
const fakeRect = (height: number): DOMRect =>
  ({
    height,
    width: 300,
    top: 0,
    left: 0,
    right: 300,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  }) as DOMRect;

describe("本文の高さ制限 (spec 3 節・brief Step 3)", () => {
  it("400px 未満では展開ボタンが出ない", async () => {
    // 捕まえる変異: 高さに関わらず常に展開ボタンを出す
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(fakeRect(200));
    try {
      const events = createRecordingEventRequests();
      const event = signed(23, { content: "short body" });
      const { element, dispose } = mount(
        () => NoteFull({ event }),
        contextWith(events),
      );
      try {
        // createElementSize の計測は createEffect 経由 (マイクロタスク) ——
        // EventView.test.tsx と同じ理由で waitFor する。
        await vi.waitFor(() => {
          expect(
            element().querySelector('[data-testid="note-content"]'),
          ).not.toBeNull();
        });
        expect(
          element().querySelector('[data-testid="note-expand"]'),
        ).toBeNull();
      } finally {
        dispose();
      }
    } finally {
      rect.mockRestore();
    }
  });

  it("展開ボタンの背景が透明 (UA 既定の buttonface が透けない)", async () => {
    // 捕まえる変異: `bg-transparent` を落とす。`<button>` の UA 既定背景は
    // `buttonface` (Chromium では不透明な #efefef) で、`appearance-none` は
    // これを消さない。背景色はグラデーションの下に敷かれるので、ぼかしの
    // 透明な側から灰色が透ける (実測: computed backgroundColor が
    // rgb(239,239,239) だった)。
    //
    // 始点の `from-white/0` も併せて固定する。現行の Chromium は
    // `in oklch` の乗算済みアルファで補間するので `from-transparent` でも
    // 見た目は同じだが、補間空間の指定が外れた環境では `rgba(0,0,0,0)`
    // からの補間が灰色を経由しうる。
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(fakeRect(500));
    try {
      const events = createRecordingEventRequests();
      const event = signed(26, { content: "long body" });
      const { element, dispose } = mount(
        () => NoteFull({ event }),
        contextWith(events),
      );
      try {
        await vi.waitFor(() => {
          expect(
            element().querySelector('[data-testid="note-expand"]'),
          ).not.toBeNull();
        });
        const className =
          element().querySelector('[data-testid="note-expand"]')?.className ??
          "";
        expect(className).toContain("bg-transparent");
        expect(className).not.toContain("from-transparent");
        expect(className).toContain("from-white/0");
        expect(className).toContain("dark:from-ui-950/0");
      } finally {
        dispose();
      }
    } finally {
      rect.mockRestore();
    }
  });

  it("400px 以上では展開ボタンが出て、押すと全文が出る", async () => {
    // 捕まえる変異: 折り畳んだまま展開できない (ボタンを押しても
    // max-height が外れない)
    const rect = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue(fakeRect(500));
    try {
      const events = createRecordingEventRequests();
      const event = signed(24, { content: "long body" });
      const { element, dispose } = mount(
        () => NoteFull({ event }),
        contextWith(events),
      );
      // クリックは document への bubble を経由して Solid の delegated event
      // (`v1-core.test.tsx` と同じ理由) で拾われるため、実 DOM に接続する。
      document.body.appendChild(element());
      try {
        await vi.waitFor(() => {
          expect(
            element().querySelector('[data-testid="note-expand"]'),
          ).not.toBeNull();
        });
        const expandButton = element().querySelector<HTMLButtonElement>(
          '[data-testid="note-expand"]',
        );

        const wrapper = element().querySelector('[data-testid="note-content"]')
          ?.parentElement as HTMLElement;
        expect(wrapper.style.maxHeight).toBe("400px");

        expandButton?.click();

        expect(
          element().querySelector('[data-testid="note-expand"]'),
        ).toBeNull();
        expect(wrapper.style.maxHeight).toBe("none");
      } finally {
        element().remove();
        dispose();
      }
    } finally {
      rect.mockRestore();
    }
  });
});

describe("プロフィールカードのホバー (仕様 5 節・brief Task6 Step 3/4)", () => {
  it("著者行 (note-author) は hover-card のトリガーを持つ", () => {
    // 捕まえる変異: `<Profile>` を `<ProfileHover>` で包むのをやめる
    // (著者名にホバーしてもカードが出なくなる)。属性名は実際に描画して
    // 確かめたもの (`data-scope`/`data-part`、`ProfileHover.test.tsx` と
    // 同じ)。
    const events = createRecordingEventRequests();
    const event = signed(70, { content: "x" });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const author = element().querySelector('[data-testid="note-author"]');
      const trigger = author?.querySelector(
        '[data-scope="hover-card"][data-part="trigger"]',
      );
      expect(trigger).not.toBeNull();
    } finally {
      dispose();
    }
  });

  it("本文中の言及 (nostr:npub) は hover-card のトリガーを持たない (カードの中の名前に入れ子でカードが出ない)", () => {
    // 捕まえる変異: `NoteContent`/`MentionToken` が使う素の `<Profile>`
    // 自体に `<ProfileHover>` を仕込む。`<Profile>` は本文中の言及・
    // リポスト/リアクションの見出し・リアクション一覧でも使われており、
    // そこにホバーを付けるとカードの中の名前にもカードが出る入れ子に
    // なる (仕様 5 節)。
    const events = createRecordingEventRequests();
    const mentioned = pubkeyFor(71);
    const event = signed(72, {
      content: `見て nostr:${encodeBech32("npub", mentioned)}`,
    });
    const { element, dispose } = mount(
      () => NoteFull({ event }),
      contextWith(events),
    );
    try {
      const content = element().querySelector('[data-testid="note-content"]');
      expect(content).not.toBeNull();
      expect(
        content?.querySelector(
          '[data-scope="hover-card"][data-part="trigger"]',
        ),
      ).toBeNull();
    } finally {
      dispose();
    }
  });
});
