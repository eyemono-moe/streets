import { describe, expect, it } from "vite-plus/test";
import { emptyFollowSet } from "./follow-set";
import {
  type FollowSetFormEvent,
  type FollowSetFormState,
  canSubmitFollowSetForm,
  closedFollowSetForm,
  followSetFormTransition,
} from "./follow-set-form";

const run = (events: FollowSetFormEvent[], from = closedFollowSetForm()) =>
  events.reduce<FollowSetFormState>(followSetFormTransition, from);

const set = {
  ...emptyFollowSet("a".repeat(64), "friends"),
  title: "友だち",
  description: "説明",
};

describe("followSetFormTransition", () => {
  it("書きかけのまま閉じようとしたら閉じず、やめれば閉じる", () => {
    // 捕まえる変異: 書きかけを黙って捨てて閉じる
    const blocked = run([
      { type: "follow-set-form/open-create" },
      { type: "follow-set-form/input", field: "title", value: "仲間" },
      { type: "follow-set-form/close" },
    ]);
    expect(blocked).toMatchObject({ phase: "editing", blocked: true });
    expect(run([{ type: "follow-set-form/discard" }], blocked)).toEqual(
      closedFollowSetForm(),
    );
  });

  it("書きかけが無ければ、閉じようとしたら閉じる", () => {
    expect(
      run([
        { type: "follow-set-form/open-edit", set },
        { type: "follow-set-form/close" },
      ]),
    ).toEqual(closedFollowSetForm());
  });

  it("直すときは、変えたところが無ければ送れない", () => {
    // 捕まえる変異: 何も変えずに保存して、署名だけ求める
    const opened = run([{ type: "follow-set-form/open-edit", set }]);
    expect(canSubmitFollowSetForm(opened)).toBe(false);
    const changed = run(
      [{ type: "follow-set-form/input", field: "description", value: "" }],
      opened,
    );
    expect(canSubmitFollowSetForm(changed)).toBe(true);
  });

  it("名前が空なら送らない", () => {
    const state = run([
      { type: "follow-set-form/open-create" },
      { type: "follow-set-form/input", field: "title", value: "  " },
      { type: "follow-set-form/submit" },
    ]);
    expect(state.phase).toBe("editing");
  });

  it("送っている間は打てず、失敗したら書きかけに戻る", () => {
    const saving = run([
      { type: "follow-set-form/open-create" },
      { type: "follow-set-form/input", field: "title", value: "仲間" },
      { type: "follow-set-form/submit" },
      { type: "follow-set-form/input", field: "title", value: "変えた" },
    ]);
    expect(saving).toMatchObject({ phase: "saving", draft: { title: "仲間" } });
    expect(run([{ type: "follow-set-form/failed" }], saving)).toMatchObject({
      phase: "editing",
      draft: { title: "仲間" },
    });
  });
});
