import { describe, expect, it } from "vite-plus/test";
import type { SectionStatus } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import {
  type ColumnSource,
  columnAlerts,
  columnFacets,
  columnStatus,
  columnTitle,
} from "./column-kinds";
import {
  buildColumn,
  buildFolloweesColumn,
  buildRelayColumn,
  buildUserColumn,
} from "./column-presets";
import { type ColumnDef, defaultDeck } from "./deck";

const PUBKEY = "a".repeat(64);

const must = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("想定したカラムが作れなかった");
  return value;
};

describe("columnTitle", () => {
  it("人に紐づくカラムは、保存した npub ではなく人として返す", () => {
    const column = buildUserColumn(PUBKEY);
    expect(column.title).toMatch(/^@npub/);
    expect(columnTitle(column)).toEqual({ person: PUBKEY, suffix: "" });
    expect(columnTitle(buildFolloweesColumn(PUBKEY))).toEqual({
      person: PUBKEY,
      suffix: " のフォロー",
    });
  });

  it("種類で決まるカラムは、保存した題名を使わない", () => {
    const home: ColumnDef = {
      ...must(defaultDeck([]).columns[0]),
      title: "変えた名前",
    };
    expect(columnTitle(home)).toEqual({ text: "ホーム" });
  });

  it("ハッシュタグ・検索・リレー全体は、条件から決める", () => {
    expect(columnTitle(must(buildColumn("hashtag", "#Nostr")))).toEqual({
      text: "#nostr",
    });
    expect(columnTitle(must(buildColumn("search", "ねこ")))).toEqual({
      text: "ねこ",
    });
    expect(
      columnTitle(must(buildRelayColumn(["wss://relay.example/"]))),
    ).toEqual({
      text: "wss://relay.example",
    });
  });

  it("条件を直に書いたカラムは、足したときの題名を使う", () => {
    const custom: ColumnDef = {
      id: "x",
      title: "リレーの kind:7",
      source: {
        kind: "literal",
        filters: [{ kinds: [7], authors: [PUBKEY] }],
        relays: ["wss://a.example/" as RelayUrl],
      },
    };
    expect(columnTitle(custom)).toEqual({ text: "リレーの kind:7" });
  });
});

const column = (source: ColumnSource): ColumnDef => ({
  id: "x",
  title: "x",
  source,
});

describe("columnFacets", () => {
  it("ホームはリプライ・引用・リポストを出し、リアクションとメンションは出さない", () => {
    // 捕まえる変異: 種類に関わらず全項目を出す
    expect(columnFacets(column({ kind: "followees", kinds: [1, 6] }))).toEqual([
      "replies",
      "quotes",
      "reposts",
    ]);
  });

  it("通知だけがメンションを出す", () => {
    // 捕まえる変異: メンションをどのカラムにも出す（ホームで切ると普通の投稿が消える）
    expect(columnFacets(column({ kind: "notifications" }))).toContain(
      "mentions",
    );
    expect(columnFacets(column({ kind: "user", pubkey: "a" }))).not.toContain(
      "mentions",
    );
  });

  it("ハッシュタグ（literal）はフィルタの kinds で決まる", () => {
    // 捕まえる変異: literal をまとめて「決められない」にする（無意味な項目が出る）
    expect(
      columnFacets(
        column({ kind: "literal", filters: [{ kinds: [1], "#t": ["nostr"] }] }),
      ),
    ).toEqual(["replies", "quotes"]);
  });

  it("kinds を持たないフィルタは決められないので全項目を出す", () => {
    expect(
      columnFacets(column({ kind: "literal", filters: [{ ids: ["a"] }] })),
    ).toEqual(["replies", "quotes", "reposts", "reactions"]);
  });

  it("フォロー一覧（kind:3）には項目が無い", () => {
    expect(
      columnFacets(column({ kind: "followees-list", pubkey: "a" })),
    ).toEqual([]);
  });
});

const status = (incomplete?: SectionStatus["incomplete"]): SectionStatus => ({
  phase: "settled",
  ...(incomplete ? { incomplete } : {}),
});

const explicit: ColumnDef = {
  id: "a",
  title: "a",
  source: { kind: "literal", filters: [{ kinds: [1] }], relays: ["wss://a/"] },
};

const routed: ColumnDef = {
  id: "b",
  title: "b",
  source: { kind: "followees", kinds: [1] },
};

const notifications: ColumnDef = {
  id: "c",
  title: "通知",
  source: { kind: "notifications" },
};

const missing = { phase: "missing" } as const;
const hasRelays = {
  phase: "ready",
  entries: [
    { url: "wss://one/" as const, read: true, write: true },
    { url: "wss://two/" as const, read: true, write: false },
  ],
} as const;
const loading = { phase: "loading" } as const;

describe("columnAlerts", () => {
  it("明示リレーが到達不能なら 1 件返す", () => {
    // 捕まえる変異: unreachableRelays 以外のフィールド (unroutableAuthors など) を見る。
    expect(
      columnAlerts(
        explicit,
        status({
          unreachableRelays: 1,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toHaveLength(1);
  });

  it("Outbox が選んだリレーが到達不能でも 0 件", () => {
    // 捕まえる変異: source の種類を見ず判定する —— ユーザーが変えられないリレーは診断値扱い。
    expect(
      columnAlerts(
        routed,
        status({
          unreachableRelays: 3,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("uncoveredAuthors だけでは 0 件", () => {
    // 捕まえる変異: incomplete が立っていれば何でも alert にする (接続予算超過は行動できない)。
    expect(
      columnAlerts(
        explicit,
        status({
          unreachableRelays: 0,
          unroutableAuthors: 0,
          uncoveredAuthors: 12,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("incomplete が無ければ 0 件", () => {
    // 捕まえる変異: incomplete を undefined のまま数値として読む
    expect(columnAlerts(explicit, status(), hasRelays)).toEqual([]);
  });

  it("literal でも relays を指定していなければ 0 件", () => {
    // 捕まえる変異: literal かどうかだけを見て relays の有無を見ない (relays 無しは Outbox 任せ)。
    const routedLiteral: ColumnDef = {
      id: "d",
      title: "d",
      source: { kind: "literal", filters: [{ kinds: [1], authors: ["abc"] }] },
    };
    expect(
      columnAlerts(
        routedLiteral,
        status({
          unreachableRelays: 2,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("通知列で自分のリレー設定が無ければ知らせる", () => {
    // 捕まえる変異: この警告を出さない (無反応か kind:10002 欠如か、画面からは区別できない)。
    const alerts = columnAlerts(notifications, status(), missing);
    expect(alerts).toHaveLength(1);
    // 捕まえる変異: 警告の種類が差し替わる。文言全体は主張しない (タイプミスでしか壊れないようにする)。
    expect(alerts[0]?.message).toContain("kind:10002");
  });

  it("リレー設定が引けていれば知らせない", () => {
    // 捕まえる変異: context を見ずに常に出す。
    expect(columnAlerts(notifications, status(), hasRelays)).toEqual([]);
  });

  it("通知以外の列では出さない", () => {
    // 捕まえる変異: source.kind を見ない (ホーム/明示リレー列は kind:10002 を必要としない)。
    expect(columnAlerts(routed, status(), missing)).toEqual([]);
    expect(columnAlerts(explicit, status(), missing)).toEqual([]);
  });

  it("settle 前は readRelayCount が 0 でも出さない", () => {
    // 捕まえる変異: ゲートを外す (起動直後の未着信を「設定無し」と確定させてしまう)。
    expect(columnAlerts(notifications, status(), loading)).toEqual([]);
  });

  it("通知列は read リレーが到達不能なら知らせる", () => {
    // 捕まえる変異: この警告を出さない (`literal` 用の分岐には引っかからず黙ってしまう)。
    const alerts = columnAlerts(
      notifications,
      status({
        unreachableRelays: 2,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      }),
      hasRelays,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.action).toContain("read リレー");
  });

  it("通知列以外では read リレーの到達不能を出さない", () => {
    // 捕まえる変異: source.kind を見ない (通知向け分岐が routed へ漏れていないか確認)。
    expect(
      columnAlerts(
        routed,
        status({
          unreachableRelays: 2,
          unroutableAuthors: 0,
          uncoveredAuthors: 0,
        }),
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("fallback が不通でもユーザー設定の不通とは表示しない", () => {
    // 捕まえる変異: ゲートしない (fallback の不通とユーザー設定の不通を混同する)。
    const alerts = columnAlerts(
      notifications,
      status({
        unreachableRelays: 3,
        unroutableAuthors: 0,
        uncoveredAuthors: 0,
      }),
      missing,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).not.toContain("あなたの設定した read リレー");
  });
});

describe("columnAlerts と読み方", () => {
  const user: ColumnDef = {
    id: "u",
    title: "u",
    source: { kind: "user", pubkey: "f".repeat(64) },
  };
  const incomplete = (
    patch: Partial<NonNullable<SectionStatus["incomplete"]>>,
  ) =>
    status({
      unreachableRelays: 0,
      unroutableAuthors: 0,
      uncoveredAuthors: 0,
      ...patch,
    });

  it("読み込みリレーだけを読んでいて届かないなら知らせる", () => {
    const alerts = columnAlerts(
      routed,
      incomplete({ unreachableRelays: 2 }),
      hasRelays,
      "direct",
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("2 本");
  });

  it("Outbox で読んでいるときは、Outbox が選んだリレーの不達を知らせない", () => {
    expect(
      columnAlerts(routed, incomplete({ unreachableRelays: 2 }), hasRelays),
    ).toEqual([]);
  });

  it("1 人のカラムでその人のリレー設定が無ければ、切り替えられることを知らせる", () => {
    const alerts = columnAlerts(
      user,
      incomplete({ unroutableAuthors: 1 }),
      hasRelays,
      "outbox",
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].action).toContain("読み込みリレーだけ");
  });

  it("取得中はリレー設定が無いと言わない", () => {
    expect(
      columnAlerts(
        user,
        {
          phase: "streaming",
          incomplete: {
            unreachableRelays: 0,
            unroutableAuthors: 1,
            uncoveredAuthors: 0,
          },
        },
        hasRelays,
      ),
    ).toEqual([]);
  });

  it("フォロー中の人のカラムでは、設定の無い人がいても知らせない", () => {
    expect(
      columnAlerts(routed, incomplete({ unroutableAuthors: 3 }), hasRelays),
    ).toEqual([]);
  });
});

describe("columnStatus", () => {
  it("セクションが無ければ取得前", () => {
    // 捕まえる変異: 空の every を真として「落ち着いた」にする（通知の警告が起動直後に出る）
    expect(columnStatus([])).toEqual({ phase: "initial" });
  });

  it("全部が落ち着くまでは落ち着いたとしない", () => {
    expect(
      columnStatus([{ phase: "settled" }, { phase: "initial" }]).phase,
    ).toBe("streaming");
    expect(
      columnStatus([{ phase: "settled" }, { phase: "settled" }]).phase,
    ).toBe("settled");
  });

  it("届かなかった数を足し合わせる", () => {
    const incomplete = {
      unreachableRelays: 1,
      unroutableAuthors: 2,
      uncoveredAuthors: 0,
    };
    expect(
      columnStatus([
        { phase: "settled", incomplete },
        { phase: "settled" },
        { phase: "settled", incomplete },
      ]),
    ).toEqual({
      phase: "settled",
      incomplete: {
        unreachableRelays: 2,
        unroutableAuthors: 4,
        uncoveredAuthors: 0,
      },
    });
  });
});
