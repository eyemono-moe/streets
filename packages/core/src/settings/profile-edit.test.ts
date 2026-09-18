import { describe, expect, it } from "vitest";
import {
  type ProfileEditEvent,
  type ProfileEditState,
  emptyProfileEdit,
  isProfileDirty,
  profileChanges,
  profileDraftFrom,
  profileEditTransition,
  profileErrors,
  profileFromDraft,
} from "./profile-edit";

const content = (fields: Record<string, unknown>) => JSON.stringify(fields);

const run = (...events: ProfileEditEvent[]): ProfileEditState =>
  events.reduce(profileEditTransition, emptyProfileEdit());

describe("profileDraftFrom", () => {
  it("扱う項目の文字列だけを読み、ほかは空にする", () => {
    const draft = profileDraftFrom(
      content({ name: "me", about: 42, lud16: "me@wallet" }),
    );
    expect(draft).toMatchObject({ name: "me", about: "" });
    expect(draft).not.toHaveProperty("lud16");
  });

  it("壊れた content や未作成は空のフォームにする", () => {
    expect(profileDraftFrom("not json").name).toBe("");
    expect(profileDraftFrom(undefined).name).toBe("");
  });
});

describe("profileEditTransition", () => {
  it("読み取った版をフォームに入れ、変えるまでは変えていない", () => {
    const state = run({
      type: "profile/loaded",
      content: content({ name: "me" }),
    });
    expect(state.draft.name).toBe("me");
    expect(isProfileDirty(state)).toBe(false);
  });

  it("変えた項目だけを、前後の空白を落として保存する", () => {
    const state = run(
      { type: "profile/loaded", content: content({ name: "me", about: "hi" }) },
      { type: "profile/input", field: "about", value: "  hello  " },
    );
    expect(isProfileDirty(state)).toBe(true);
    expect(profileChanges(state)).toEqual({ about: "hello" });
  });

  it("空白を足しただけなら、変えたことにしない", () => {
    const state = run(
      { type: "profile/loaded", content: content({ name: "me" }) },
      { type: "profile/input", field: "name", value: "me " },
    );
    expect(isProfileDirty(state)).toBe(false);
  });

  it("書きかけの間に別の版が届いたら、書きかけは残し、触っていない項目は新しい版に合わせる", () => {
    // 捕まえる変異: 触っていない項目を古い値のまま残す —— 保存すると、別の端末で
    // 変えた名前を古い名前へ戻してしまう。
    const state = run(
      { type: "profile/loaded", content: content({ name: "me" }) },
      { type: "profile/input", field: "about", value: "draft" },
      { type: "profile/loaded", content: content({ name: "renamed" }) },
    );
    expect(state.draft).toMatchObject({ name: "renamed", about: "draft" });
    expect(profileChanges(state)).toEqual({ about: "draft" });
  });

  it("変えていないときは、保存を始めない", () => {
    const state = run({ type: "profile/save" });
    expect(state.saving).toBe(false);
  });

  it("保存できたら、書いた値を読み取った版とみなす", () => {
    const state = run(
      { type: "profile/input", field: "name", value: "me" },
      { type: "profile/save" },
      { type: "profile/saved" },
    );
    expect(state).toMatchObject({ saving: false });
    expect(isProfileDirty(state)).toBe(false);
  });

  it("元に戻すと、読み取った版に戻る", () => {
    const state = run(
      { type: "profile/loaded", content: content({ name: "me" }) },
      { type: "profile/input", field: "name", value: "other" },
      { type: "profile/reset" },
    );
    expect(state.draft.name).toBe("me");
  });

  it("初期状態は呼ぶたびに別のオブジェクトになる", () => {
    expect(emptyProfileEdit()).not.toBe(emptyProfileEdit());
    expect(emptyProfileEdit().draft).not.toBe(emptyProfileEdit().draft);
  });
});

describe("profileErrors", () => {
  it("URL の欄は http(s) だけを通し、空欄は通す", () => {
    const errors = profileErrors({
      ...emptyProfileEdit().draft,
      picture: "javascript:alert(1)",
      website: "https://example.com",
    });
    expect(errors).toEqual({
      picture: "https:// で始まる URL を入力してください",
    });
  });

  it("NIP-05 は name@domain の形", () => {
    expect(
      profileErrors({ ...emptyProfileEdit().draft, nip05: "me" }).nip05,
    ).toBeDefined();
    expect(
      profileErrors({ ...emptyProfileEdit().draft, nip05: "me@example.com" }),
    ).toEqual({});
  });
});

describe("profileFromDraft", () => {
  it("読む側と同じ形にし、空欄は書いていないとみなす", () => {
    expect(
      profileFromDraft({
        ...emptyProfileEdit().draft,
        display_name: " わたし ",
        about: "  ",
      }),
    ).toEqual({
      name: undefined,
      displayName: "わたし",
      picture: undefined,
      about: undefined,
      banner: undefined,
    });
  });
});
