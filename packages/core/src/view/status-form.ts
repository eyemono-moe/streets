import type { UserStatusInput } from "../nostr/build/user-status";
import type { UserStatus } from "../nostr/user-status";

/** 消える時刻の選び方。`keep` は、直す前に付いていた期限のまま。 */
export type StatusExpiry = "never" | "1h" | "today" | "1w" | "keep";

export type StatusDraft = {
  content: string;
  link: string;
  expiry: StatusExpiry;
};

/**
 * 自分のステータスを設定するフォーム。書きかけがある間は閉じさせない（AGENTS の
 * 「保存」を押すフォームの決まり）。`clearing` は「ステータスを消す」で送っている途中。
 */
export type StatusFormState =
  | { phase: "closed" }
  | {
      phase: "editing" | "saving";
      draft: StatusDraft;
      initial: StatusDraft;
      /** 直す前に付いていた期限（秒）。`keep` のときに使う。 */
      keptExpiresAt: number | undefined;
      /** 今のステータスがあるか。無ければ「消す」を出さない。 */
      hasCurrent: boolean;
      clearing: boolean;
      blocked: boolean;
    };

export type StatusFormEvent =
  | { type: "status-form/open"; current: UserStatus | undefined }
  | { type: "status-form/input"; field: "content" | "link"; value: string }
  | { type: "status-form/expiry"; expiry: StatusExpiry }
  | { type: "status-form/submit" }
  | { type: "status-form/clear" }
  | { type: "status-form/saved" }
  | { type: "status-form/failed" }
  /** 閉じようとした（× や Esc）。書きかけがあれば閉じない。 */
  | { type: "status-form/close" }
  /** 「やめる」。書きかけを捨てて閉じる。 */
  | { type: "status-form/discard" };

export const closedStatusForm = (): StatusFormState => ({ phase: "closed" });

const sameDraft = (a: StatusDraft, b: StatusDraft) =>
  a.content === b.content && a.link === b.link && a.expiry === b.expiry;

export const isStatusFormDirty = (state: StatusFormState): boolean =>
  state.phase !== "closed" && !sameDraft(state.draft, state.initial);

/** 送れるか。本文が要り、直すときは何か変えている必要がある。 */
export const canSubmitStatusForm = (state: StatusFormState): boolean =>
  state.phase === "editing" &&
  state.draft.content.trim().length > 0 &&
  (!state.hasCurrent || isStatusFormDirty(state));

/** 選んだ期限を、消える時刻（秒）にする。「今日中」は、その日の終わり。 */
export const statusExpiresAt = (
  expiry: StatusExpiry,
  now: Date,
  kept: number | undefined,
): number | undefined => {
  const seconds = Math.floor(now.getTime() / 1000);
  switch (expiry) {
    case "never":
      return undefined;
    case "keep":
      return kept;
    case "1h":
      return seconds + 60 * 60;
    case "1w":
      return seconds + 7 * 86_400;
    case "today": {
      const end = new Date(now);
      end.setHours(23, 59, 59, 0);
      return Math.floor(end.getTime() / 1000);
    }
  }
};

/** 送る中身。消すときは空の本文にする（NIP-38）。 */
export const statusFormInput = (
  state: Exclude<StatusFormState, { phase: "closed" }>,
  now: Date,
): UserStatusInput =>
  state.clearing
    ? { content: "" }
    : {
        content: state.draft.content,
        link: state.draft.link,
        expiresAt: statusExpiresAt(
          state.draft.expiry,
          now,
          state.keptExpiresAt,
        ),
      };

export const statusFormTransition = (
  state: StatusFormState,
  event: StatusFormEvent,
): StatusFormState => {
  if (event.type === "status-form/open") {
    if (state.phase !== "closed") return state;
    const current = event.current;
    const draft: StatusDraft = {
      content: current?.content ?? "",
      link: current?.link?.type === "url" ? current.link.url : "",
      expiry: current
        ? current.expiresAt === undefined
          ? "never"
          : "keep"
        : "1h",
    };
    return {
      phase: "editing",
      draft,
      initial: { ...draft },
      keptExpiresAt: current?.expiresAt,
      hasCurrent: current !== undefined,
      clearing: false,
      blocked: false,
    };
  }
  if (state.phase === "closed") return state;
  switch (event.type) {
    case "status-form/input":
      if (state.phase === "saving") return state;
      return {
        ...state,
        draft: { ...state.draft, [event.field]: event.value },
        blocked: false,
      };
    case "status-form/expiry":
      if (state.phase === "saving") return state;
      return {
        ...state,
        draft: { ...state.draft, expiry: event.expiry },
        blocked: false,
      };
    case "status-form/submit":
      return canSubmitStatusForm(state)
        ? { ...state, phase: "saving", clearing: false, blocked: false }
        : state;
    case "status-form/clear":
      return state.phase === "editing" && state.hasCurrent
        ? { ...state, phase: "saving", clearing: true, blocked: false }
        : state;
    case "status-form/saved":
      return closedStatusForm();
    case "status-form/failed":
      return { ...state, phase: "editing", clearing: false };
    case "status-form/close":
      if (state.phase === "saving") return state;
      return isStatusFormDirty(state)
        ? { ...state, blocked: true }
        : closedStatusForm();
    case "status-form/discard":
      return state.phase === "saving" ? state : closedStatusForm();
  }
  return state;
};
