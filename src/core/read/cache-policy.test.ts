import { describe, expect, it } from "vitest";
import {
  type CachePolicy,
  isStale,
  persistableScope,
  policyFor,
  registeredKinds,
  shouldPersist,
} from "./cache-policy";

describe("policyFor", () => {
  it.each<[string, number, CachePolicy, string]>([
    [
      "kind:3 (フォローリスト)",
      3,
      {
        staleMs: 0,
        serveWhileRevalidating: false,
        retention: { type: "none" },
        scope: "public",
      },
      "kind:3 を既定側に落とす変異 (古いフォローリストがそのまま使われる)",
    ],
    [
      "kind:10002 (リレーリスト)",
      10002,
      {
        staleMs: 7 * 24 * 60 * 60 * 1000,
        serveWhileRevalidating: true,
        retention: { type: "latest-per-author" },
        scope: "public",
      },
      "表の値を取り違える変異",
    ],
    [
      "kind:0 (プロフィール)",
      0,
      {
        staleMs: 24 * 60 * 60 * 1000,
        serveWhileRevalidating: true,
        retention: { type: "latest-per-author" },
        scope: "public",
      },
      "表の値を取り違える変異",
    ],
  ])("%s は表のとおり (%s)", (_name, kind, expected) => {
    expect(policyFor(kind)).toEqual(expected);
  });

  it.each([1, 6, 7, 9999])(
    "未知/不変な kind:%i は既定値 (staleMs: ∞, serve: true, retention: none)",
    (kind) => {
      // 新しい kind が来るたびに例外を投げるのではなく、安全側の既定へ倒す。
      expect(() => policyFor(kind)).not.toThrow();
      expect(policyFor(kind)).toEqual({
        staleMs: Number.POSITIVE_INFINITY,
        serveWhileRevalidating: true,
        retention: { type: "none" },
        scope: "session",
      });
    },
  );
});

describe("isStale", () => {
  const finitePolicy: CachePolicy = {
    staleMs: 1000,
    serveWhileRevalidating: true,
    retention: { type: "none" },
    scope: "session",
  };

  // fetchedAt は 0 以外を使う —— 0 は invalidate 済みを表す特別値で、
  // 経過時間の計算より前に stale 扱いになるため境界の検証には使えない。
  it("経過が staleMs ちょうどではまだ新鮮 (false)", () => {
    // 境界を `>=` にする変異を捕まえる。
    expect(isStale(finitePolicy, 1, 1001)).toBe(false);
  });

  it("経過が staleMs を 1 でも超えると stale (true)", () => {
    expect(isStale(finitePolicy, 1, 1002)).toBe(true);
  });

  it("経過が staleMs 未満なら新鮮 (false)", () => {
    expect(isStale(finitePolicy, 1, 1000)).toBe(false);
  });

  it("staleMs: 0 は fetchedAt/now によらず常に stale", () => {
    // 0 を「無期限」（決して stale にならない）と取り違える変異を捕まえる。
    const alwaysRefetch: CachePolicy = {
      staleMs: 0,
      serveWhileRevalidating: false,
      retention: { type: "none" },
      scope: "session",
    };
    expect(isStale(alwaysRefetch, 500, 500)).toBe(true);
    expect(isStale(alwaysRefetch, 0, 0)).toBe(true);
  });

  it("staleMs: ∞ は fetchedAt/now によらず常に新鮮 (false)", () => {
    // ∞ との比較を誤る変異 (例: `now - fetchedAt > Infinity` を素朴に
    // 逆にする、または NaN 経由で true になる) を捕まえる。
    const neverStale: CachePolicy = {
      staleMs: Number.POSITIVE_INFINITY,
      serveWhileRevalidating: true,
      retention: { type: "none" },
      scope: "session",
    };
    expect(isStale(neverStale, 0, 0)).toBe(false);
    expect(isStale(neverStale, 0, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("fetchedAt: 0 (invalidate 済み) は finite な staleMs の下で常に stale", () => {
    // 0 を「未設定」として特別に新鮮扱いする変異、または `now` も 0 に
    // 近い偽時計の下で経過時間だけを見て新鮮と誤判定する変異を捕まえる。
    expect(isStale(finitePolicy, 0, 0)).toBe(true);
    expect(isStale(finitePolicy, 0, 500)).toBe(true);
  });
});

describe("scope (誰が見てよいか)", () => {
  it("分類の無い kind は永続化されない", () => {
    // 捕まえる変異: DEFAULT_POLICY の scope を "public" にする。
    // 既定が fail-closed でないと、ミュートや復号結果を足す人が分類を
    // 名乗り忘れた瞬間に共有 DB へ書かれ、別アカウントへ漏れる。
    // **これは後から引き剥がせない** (仕様 2.1 節)。
    expect(policyFor(9999).scope).toBe("session");
    expect(shouldPersist(9999)).toBe(false);
  });

  it("kind:0 と kind:10002 は public で永続化される", () => {
    // 捕まえる変異: scope を見ずに retention だけで決める (この 2 つは
    // 通ってしまうので、これだけでは変異を捕まえられない —— 下の
    // kind:3 と「account は書かない」の 2 件が対になって初めて効く)
    expect(policyFor(0).scope).toBe("public");
    expect(shouldPersist(0)).toBe(true);
    expect(policyFor(10002).scope).toBe("public");
    expect(shouldPersist(10002)).toBe(true);
  });

  it("kind:3 は public だが retention: none なので永続化されない", () => {
    // 捕まえる変異: 2 軸を 1 つのフラグに潰す。イベント自体は公開なので
    // scope は "public" が正しく、永続化しない理由は別軸 (古いフォロー
    // リストで購読すると外した著者を画面から消せない)。潰すと「共有して
    // よいが保持はしたくない」が表現できなくなる (仕様 6 節)。
    expect(policyFor(3).scope).toBe("public");
    expect(shouldPersist(3)).toBe(false);
  });

  it("public でない kind は retention があっても永続化されない", () => {
    // 捕まえる変異: shouldPersist が scope を見ない。これがこのスライスの
    // 中心 —— account/session の kind が共有 DB へ書かれるのを防ぐ。
    for (const scope of ["account", "session"] as const) {
      const policy: CachePolicy = {
        staleMs: 0,
        serveWhileRevalidating: true,
        retention: { type: "latest-per-author" },
        scope,
      };
      expect(persistableScope(policy)).toBe(false);
    }
  });

  it("登録済みの kind はすべて scope を名乗っている", () => {
    // 捕まえる変異: 表のどれか 1 つから scope を落とす。型で必須にして
    // いるので普通は通らないが、`as` で抜ける余地を塞ぐ。
    for (const kind of registeredKinds()) {
      expect(policyFor(kind).scope).toBeDefined();
    }
  });
});
