import type { FollowSet } from "./follow-set";

export type FollowSetDraft = {
  title: string;
  description: string;
  image: string;
};

/**
 * リストを作る・直すフォーム。書きかけがある間は閉じさせない（AGENTS の
 * 「保存」を押すフォームの決まり）。閉じようとしたら `blocked` を立て、画面は
 * 「保存するか、やめてから閉じてください」を出す。
 */
export type FollowSetFormState =
  | { phase: "closed" }
  | {
      phase: "editing" | "saving";
      mode: "create" | "edit";
      /** 直すときのリストの `d`。 */
      identifier?: string;
      draft: FollowSetDraft;
      /** 開いたときの中身。書きかけかどうかを比べる。 */
      initial: FollowSetDraft;
      /** 書きかけのまま閉じようとした。 */
      blocked: boolean;
    };

export type FollowSetFormEvent =
  | { type: "follow-set-form/open-create" }
  | { type: "follow-set-form/open-edit"; set: FollowSet }
  | {
      type: "follow-set-form/input";
      field: keyof FollowSetDraft;
      value: string;
    }
  | { type: "follow-set-form/submit" }
  | { type: "follow-set-form/saved" }
  | { type: "follow-set-form/failed" }
  /** 閉じようとした（× や Esc）。書きかけがあれば閉じない。 */
  | { type: "follow-set-form/close" }
  /** 「やめる」。書きかけを捨てて閉じる。 */
  | { type: "follow-set-form/discard" };

export const closedFollowSetForm = (): FollowSetFormState => ({
  phase: "closed",
});

const sameDraft = (a: FollowSetDraft, b: FollowSetDraft) =>
  a.title === b.title && a.description === b.description && a.image === b.image;

export const isFollowSetFormDirty = (state: FollowSetFormState): boolean =>
  state.phase !== "closed" && !sameDraft(state.draft, state.initial);

/** 送れるか。名前が要る。直すときは、変えたところが要る。 */
export const canSubmitFollowSetForm = (state: FollowSetFormState): boolean =>
  state.phase === "editing" &&
  state.draft.title.trim().length > 0 &&
  (state.mode === "create" || isFollowSetFormDirty(state));

const open = (
  mode: "create" | "edit",
  draft: FollowSetDraft,
  identifier?: string,
): FollowSetFormState => ({
  phase: "editing",
  mode,
  ...(identifier === undefined ? {} : { identifier }),
  draft,
  initial: { ...draft },
  blocked: false,
});

export const followSetFormTransition = (
  state: FollowSetFormState,
  event: FollowSetFormEvent,
): FollowSetFormState => {
  switch (event.type) {
    case "follow-set-form/open-create":
      // 書きかけがあるときに開き直させない。今の書きかけを先に片付けてもらう。
      if (state.phase !== "closed") return state;
      return open("create", { title: "", description: "", image: "" });
    case "follow-set-form/open-edit":
      if (state.phase !== "closed") return state;
      return open(
        "edit",
        {
          title: event.set.title ?? "",
          description: event.set.description ?? "",
          image: event.set.image ?? "",
        },
        event.set.identifier,
      );
  }
  if (state.phase === "closed") return state;
  switch (event.type) {
    case "follow-set-form/input":
      if (state.phase === "saving") return state;
      return {
        ...state,
        draft: { ...state.draft, [event.field]: event.value },
        blocked: false,
      };
    case "follow-set-form/submit":
      return canSubmitFollowSetForm(state)
        ? { ...state, phase: "saving", blocked: false }
        : state;
    case "follow-set-form/saved":
      return closedFollowSetForm();
    case "follow-set-form/failed":
      return { ...state, phase: "editing" };
    case "follow-set-form/close":
      if (state.phase === "saving") return state;
      return isFollowSetFormDirty(state)
        ? { ...state, blocked: true }
        : closedFollowSetForm();
    case "follow-set-form/discard":
      return state.phase === "saving" ? state : closedFollowSetForm();
  }
  return state;
};
