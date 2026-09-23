import { describe, expect, it } from "vitest";
import {
  type MuteEditEvent,
  type MuteEditState,
  displayedMutes,
  emptyMuteEdit,
  muteEditTransition,
} from "./mute-edit";
import type { MuteChange, MuteEntry } from "./mute-list";

const word = (
  value: string,
  visibility: "private" | "public" = "private",
): MuteEntry => ({
  target: { type: "word", value },
  visibility,
});
const add = (entry: MuteEntry): MuteChange => ({ type: "add", entry });
const remove = (entry: MuteEntry): MuteChange => ({ type: "remove", entry });

const run = (...events: MuteEditEvent[]): MuteEditState =>
  events.reduce(muteEditTransition, emptyMuteEdit());

describe("muteEditTransition", () => {
  it("書きかけは、待ちが明けると送る側へ移る（配列は使い回さない）", () => {
    const before = run({ type: "mutes/change", change: add(word("a")) });
    const after = muteEditTransition(before, { type: "mutes/flush" });
    expect(after).toEqual({ pending: [], saving: [add(word("a"))] });
    expect(after.saving).not.toBe(before.pending);
  });

  it("送っている途中は次を送らず、書きかけとして残す", () => {
    const state = run(
      { type: "mutes/change", change: add(word("a")) },
      { type: "mutes/flush" },
      { type: "mutes/change", change: add(word("b")) },
      { type: "mutes/flush" },
    );
    expect(state).toEqual({
      pending: [add(word("b"))],
      saving: [add(word("a"))],
    });
  });

  it("送れても送れなくても、送った分は忘れる", () => {
    const sending = run(
      { type: "mutes/change", change: add(word("a")) },
      { type: "mutes/flush" },
    );
    expect(muteEditTransition(sending, { type: "mutes/saved" }).saving).toEqual(
      [],
    );
    expect(
      muteEditTransition(sending, { type: "mutes/failed" }).saving,
    ).toEqual([]);
  });

  it("画面には、送っている途中と書きかけの両方を当てて出す", () => {
    const state = run(
      { type: "mutes/change", change: add(word("new")) },
      { type: "mutes/flush" },
      { type: "mutes/change", change: remove(word("old")) },
    );
    expect(displayedMutes([word("old")], state)).toEqual([word("new")]);
  });

  it("初期状態は呼ぶたびに別のオブジェクトになる", () => {
    expect(emptyMuteEdit()).not.toBe(emptyMuteEdit());
  });
});
