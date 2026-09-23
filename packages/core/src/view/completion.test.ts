import { describe, expect, it } from "vitest";
import {
  type CompletionMatch,
  type CompletionState,
  EMOJI_TRIGGER,
  USER_TRIGGER,
  applyCompletion,
  completionTransition,
  findCompletion,
  initialCompletion,
  rankUsers,
} from "./completion";

const both = [USER_TRIGGER, EMOJI_TRIGGER];
const at = (text: string) => findCompletion(text, text.length, both);

describe("findCompletion", () => {
  it("@ の直後から人の補完を出す", () => {
    expect(at("こんにちは @")).toEqual({
      kind: "user",
      prefix: "@",
      query: "",
      start: 6,
      end: 7,
    });
    expect(at("こんにちは @eye")?.query).toBe("eye");
  });

  it("打たれた印を返す（同じ種類でも印で入れる形を変えられるように）", () => {
    const search = [
      { kind: "user" as const, prefixes: ["from:", "to:"], keepPrefix: true },
      USER_TRIGGER,
    ];
    expect(findCompletion("to:e", 4, search)?.prefix).toBe("to:");
    expect(findCompletion("ねこ @e", 5, search)?.prefix).toBe("@");
  });

  it("全角の ＠ ：でも出す", () => {
    expect(at("＠えいも")).toMatchObject({ kind: "user", query: "えいも" });
    expect(at("：ｎｅ")).toMatchObject({ kind: "emoji", query: "ｎｅ" });
  });

  it("直前が日本語でも出す", () => {
    expect(at("かわいい:ne")).toEqual({
      kind: "emoji",
      prefix: ":",
      query: "ne",
      start: 4,
      end: 7,
    });
  });

  it("言葉の途中の印では出さない（メールアドレス・時刻・URL）", () => {
    expect(at("me@example")).toBeUndefined();
    expect(at("12:30")).toBeUndefined();
    expect(at("https:")).toBeUndefined();
    expect(at("https://")).toBeUndefined();
  });

  it("絵文字は 1 文字打つまで出さない", () => {
    expect(at("ねこ :")).toBeUndefined();
    expect(at("ねこ :n")).toMatchObject({ kind: "emoji", query: "n" });
  });

  it("絵文字はショートコードに使えない文字を打ったら閉じる", () => {
    expect(at(":ねこ")).toBeUndefined();
  });

  it("入れ終わった :neko: の後では出さない", () => {
    expect(at("かわいい:neko:")).toBeUndefined();
  });

  it("空白を打ったら閉じる", () => {
    expect(at("@eye mono")).toBeUndefined();
  });

  it("カーソルより後ろは見ない", () => {
    expect(findCompletion("@eyemono です", 4, both)).toEqual({
      kind: "user",
      prefix: "@",
      query: "eye",
      start: 0,
      end: 4,
    });
  });

  it("渡していない種類は出さない", () => {
    expect(findCompletion(":ne", 3, [USER_TRIGGER])).toBeUndefined();
  });

  it("keepPrefix なら印を残して置き換える", () => {
    const from = {
      kind: "user" as const,
      prefixes: ["from:"],
      keepPrefix: true,
    };
    expect(findCompletion("ねこ from:eye", 11, [from])).toEqual({
      kind: "user",
      prefix: "from:",
      query: "eye",
      start: 8,
      end: 11,
    });
  });

  it("印の無い種類は欄全体を 1 つの問い合わせにする", () => {
    const whole = { kind: "user" as const, prefixes: [] };
    expect(findCompletion(" eye ", 2, [whole])).toEqual({
      kind: "user",
      prefix: "",
      query: "eye",
      start: 0,
      end: 5,
    });
  });
});

describe("applyCompletion", () => {
  const match = { start: 3, end: 7 };

  it("範囲を置き換え、カーソルを入れたものの後ろへ置く", () => {
    expect(applyCompletion("ねこ :nek", match, ":neko:")).toEqual({
      text: "ねこ :neko:",
      caret: 9,
    });
  });

  it("space なら後ろに空白を 1 つ置く", () => {
    expect(
      applyCompletion("hi @eye", match, "nostr:x", { space: true }),
    ).toEqual({ text: "hi nostr:x ", caret: 11 });
  });

  it("既に空白が続いていれば足さずに、その後ろへ送る", () => {
    expect(
      applyCompletion("hi @eye です", match, "nostr:x", { space: true }),
    ).toEqual({ text: "hi nostr:x です", caret: 11 });
  });
});

describe("completionTransition", () => {
  const match = (query: string, start = 0): CompletionMatch => ({
    kind: "user",
    prefix: "@",
    query,
    start,
    end: start + query.length + 1,
  });
  const run = (...events: Parameters<typeof completionTransition>[1][]) =>
    events.reduce<CompletionState>(completionTransition, initialCompletion());

  it("打った言葉が変わったら先頭の候補へ戻す", () => {
    const state = run(
      { type: "completion/input", match: match("e") },
      { type: "completion/move", delta: 1, count: 3 },
      { type: "completion/input", match: match("ey") },
    );
    expect(state.active).toBe(0);
  });

  it("言葉が同じなら選んでいる候補を保つ", () => {
    const state = run(
      { type: "completion/input", match: match("e") },
      { type: "completion/move", delta: 1, count: 3 },
      { type: "completion/input", match: match("e") },
    );
    expect(state.active).toBe(1);
  });

  it("端で反対の端へ回る", () => {
    const up = run(
      { type: "completion/input", match: match("e") },
      { type: "completion/move", delta: -1, count: 3 },
    );
    expect(up.active).toBe(2);
    expect(
      completionTransition(up, { type: "completion/move", delta: 1, count: 3 })
        .active,
    ).toBe(0);
  });

  it("候補が減って範囲の外にいたら、末尾から数える", () => {
    const state = run(
      { type: "completion/input", match: match("e") },
      { type: "completion/move", delta: 1, count: 5 },
      { type: "completion/move", delta: 1, count: 5 },
      { type: "completion/move", delta: -1, count: 2 },
    );
    expect(state.active).toBe(0);
  });

  it("閉じていれば移らない", () => {
    expect(run({ type: "completion/move", delta: 1, count: 3 })).toEqual(
      initialCompletion(),
    );
  });

  it("Esc で閉じた印は、打ち続けても開かない", () => {
    const state = run(
      { type: "completion/input", match: match("e", 4) },
      { type: "completion/dismiss" },
      { type: "completion/input", match: match("ey", 4) },
    );
    expect(state.match).toBeUndefined();
  });

  it("Esc で閉じても、別の印を打てば開く", () => {
    const state = run(
      { type: "completion/input", match: match("e", 4) },
      { type: "completion/dismiss" },
      { type: "completion/input", match: undefined },
      { type: "completion/input", match: match("", 10) },
    );
    expect(state.match).toEqual(match("", 10));
  });

  it("印が消えたら、閉じた印のことも忘れる", () => {
    const state = run(
      { type: "completion/input", match: match("e", 4) },
      { type: "completion/dismiss" },
      { type: "completion/input", match: undefined },
      { type: "completion/input", match: match("e", 4) },
    );
    expect(state.match).toEqual(match("e", 4));
  });

  it("選んだら閉じる", () => {
    expect(
      run(
        { type: "completion/input", match: match("e") },
        { type: "completion/chosen" },
      ),
    ).toEqual(initialCompletion());
  });
});

describe("rankUsers", () => {
  const user = (pubkey: string, names: string[], rank = 1) => ({
    pubkey,
    names,
    rank,
  });
  const alice = user("a", ["アリス", "alice"]);
  const malice = user("m", ["Malice", "malice"]);
  const bob = user("b", ["ボブ", "bob"], 0);
  const pubkeys = (users: { pubkey: string }[]) => users.map((u) => u.pubkey);

  it("空なら rank の順、同じ rank は渡した順", () => {
    expect(pubkeys(rankUsers([alice, malice, bob], ""))).toEqual([
      "b",
      "a",
      "m",
    ]);
  });

  it("前から一致するものを、途中で一致するものより先に出す", () => {
    expect(pubkeys(rankUsers([malice, alice], "ali"))).toEqual(["a", "m"]);
  });

  it("カタカナの名前をひらがなで引ける", () => {
    expect(pubkeys(rankUsers([alice, bob], "ありす"))).toEqual(["a"]);
  });

  it("npub は前から一致するときだけ当てる", () => {
    const withId = { ...user("n", ["ねこ"]), ids: ["npub1abc"] };
    expect(pubkeys(rankUsers([withId], "npub1a"))).toEqual(["n"]);
    expect(rankUsers([withId], "abc")).toEqual([]);
  });

  it("当たらない人は出さない", () => {
    expect(rankUsers([alice, bob], "carol")).toEqual([]);
  });

  it("同じ人は rank の小さいほうだけを残す", () => {
    const again = user("a", ["アリス"], 0);
    expect(rankUsers([alice, again], "")).toEqual([again]);
  });
});
