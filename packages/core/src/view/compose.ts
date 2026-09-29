import type { BlobDescriptor } from "../media/blossom";
import type { ComposeDraft } from "./compose-drafts";

/**
 * 書きかけに添えたファイル。中身（File）はアプリ側が持ち、ここには見せ方と
 * アップロードした結果だけを置く。アップロードするのは送るときなので、書いている間はまだどこにも
 * 送っていない —— 切り抜いてからアップロードできるし、書くのをやめれば何も残らない。
 */
/** 切り抜く範囲。元の画像の画素で数える（左上が 0, 0）。 */
export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Attachment = {
  id: string;
  name: string;
  /** 元の画像の URL。切り抜いても差し替えない —— 何度でも切り直せるように。 */
  preview: string;
  /** ファイルの種類（`image/gif`・`video/mp4` など）。動画は切り抜けない。 */
  type?: string;
  /** 切り抜く範囲。無ければ全体。実際に切るのは、アップロードする直前。 */
  crop?: CropRect;
  /** アップロードが終わったもの。切り抜き直すとアップロードし直しになるので消える。 */
  blob?: BlobDescriptor;
  uploading?: boolean;
  /** アップロードできなかった理由。 */
  error?: string;
};

/** 投稿・返信の書きかけ。 */
export type ComposeState = {
  content: string;
  /** 送っている間は、本文を変えさせず、もう一度送らせない。 */
  sending: boolean;
  /** 添えたファイル。並び順がそのまま本文に並ぶ順になる。 */
  attachments: Attachment[];
  /** 閲覧注意の理由。`undefined` は付けない、空文字は理由なしで付ける。 */
  contentWarning?: string;
  /**
   * 書きかけを残す下書き。開いた下書きか、一度残した書きかけ。閉じたときに同じ下書きを
   * 書き換え、送れたら消す。
   */
  draft?: { id: string; kept: boolean };
};

export type ComposeEvent =
  | { type: "compose/input"; content: string }
  | { type: "compose/submit" }
  /** 送れた。本文を空にする。 */
  | { type: "compose/sent" }
  /** 送れなかった。本文は残して、そのまま送り直せるようにする。 */
  | { type: "compose/failed" }
  /** ファイルを添えた（まだアップロードしていない）。 */
  | {
      type: "compose/attach-add";
      id: string;
      name: string;
      preview: string;
      mime?: string;
    }
  | { type: "compose/attach-remove"; id: string }
  /** 並べ替える。`to` は動かした先の位置。 */
  | { type: "compose/attach-move"; id: string; to: number }
  /** 切り抜く範囲を決める（`undefined` で全体に戻す）。アップロードし直しになる。 */
  | { type: "compose/attach-crop"; id: string; crop: CropRect | undefined }
  | { type: "compose/attach-uploading"; id: string }
  | { type: "compose/attach-done"; id: string; blob: BlobDescriptor }
  | { type: "compose/attach-failed"; id: string; error: string }
  /** 閲覧注意にする・外す。外すと書いた理由も消える。 */
  | { type: "compose/warning-toggle" }
  | { type: "compose/warning-input"; reason: string }
  /** 下書きを開く。いまの書きかけと添えたファイルは捨てる（残すのは裁定する段）。 */
  | { type: "compose/load"; draft: ComposeDraft }
  /** 書きかけを下書きとして残した。以後は同じ下書きを書き換える。 */
  | { type: "compose/draft-bound"; id: string; kept: boolean }
  /** 下書きへ移したので、空に戻す。 */
  | { type: "compose/reset" };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyCompose = (): ComposeState => ({
  content: "",
  sending: false,
  attachments: [],
});

/**
 * 下書きへ移せるか。添えたファイルは下書きに残せないので、添えている間は移さない
 * （移すと黙ってファイルを捨てることになる）。
 */
export const canKeepDraft = (state: ComposeState): boolean =>
  !state.sending &&
  state.attachments.length === 0 &&
  state.content.trim().length > 0;

/** まだアップロードしていないファイル。送るときに、この順でアップロードする。 */
export const pendingAttachments = (state: ComposeState): Attachment[] =>
  state.attachments.filter((attachment) => attachment.blob === undefined);

/**
 * 投稿に添えるファイル。並び順のまま返す —— 本文の末尾に URL を並べるときの順。
 */
export const composeMedia = (state: ComposeState): BlobDescriptor[] =>
  state.attachments.flatMap((attachment) =>
    attachment.blob ? [attachment.blob] : [],
  );

/** 送れる本文。ファイルだけを投稿することもあるので、空でも返す。 */
export const sendableText = (state: ComposeState): string =>
  state.content.trim();

/** 送る閲覧注意の理由。付けていなければ `undefined`。 */
export const sendableWarning = (state: ComposeState): string | undefined =>
  state.contentWarning?.trim();

/** 送れるか。本文もファイルも無いときと、送っている途中は送らない。 */
export const canSend = (state: ComposeState): boolean =>
  !state.sending &&
  (sendableText(state).length > 0 || state.attachments.length > 0);

const mapAttachment = (
  state: ComposeState,
  id: string,
  change: (attachment: Attachment) => Attachment,
): ComposeState => ({
  ...state,
  attachments: state.attachments.map((attachment) =>
    attachment.id === id ? change(attachment) : attachment,
  ),
});

const moveAttachment = (
  attachments: readonly Attachment[],
  id: string,
  to: number,
): Attachment[] => {
  const from = attachments.findIndex((attachment) => attachment.id === id);
  if (from === -1) return [...attachments];
  const target = Math.min(Math.max(to, 0), attachments.length - 1);
  const rest = attachments.filter((_, index) => index !== from);
  const moved = attachments[from];
  if (!moved) return [...attachments];
  return [...rest.slice(0, target), moved, ...rest.slice(target)];
};

export const composeTransition = (
  state: ComposeState,
  event: ComposeEvent,
): ComposeState => {
  switch (event.type) {
    case "compose/input":
      return state.sending ? state : { ...state, content: event.content };
    case "compose/submit":
      // 送り直すときは、前に失敗した理由を消してからアップロードし直す。
      return canSend(state)
        ? {
            ...state,
            sending: true,
            attachments: state.attachments.map((attachment) => ({
              ...attachment,
              error: undefined,
            })),
          }
        : state;
    case "compose/sent":
      return state.sending ? emptyCompose() : state;
    case "compose/failed":
      return state.sending ? { ...state, sending: false } : state;
    case "compose/attach-add":
      return {
        ...state,
        attachments: [
          ...state.attachments,
          {
            id: event.id,
            name: event.name,
            preview: event.preview,
            type: event.mime,
          },
        ],
      };
    case "compose/attach-remove":
      return {
        ...state,
        attachments: state.attachments.filter(
          (attachment) => attachment.id !== event.id,
        ),
      };
    case "compose/attach-move":
      return {
        ...state,
        attachments: moveAttachment(state.attachments, event.id, event.to),
      };
    case "compose/attach-crop":
      return mapAttachment(state, event.id, (attachment) => ({
        ...attachment,
        crop: event.crop,
        // 切る範囲が変われば、アップロードしたものはもう違う画像。アップロードし直す。
        blob: undefined,
        error: undefined,
      }));
    case "compose/attach-uploading":
      return mapAttachment(state, event.id, (attachment) => ({
        ...attachment,
        uploading: true,
        error: undefined,
      }));
    case "compose/attach-done":
      return mapAttachment(state, event.id, (attachment) => ({
        ...attachment,
        uploading: false,
        blob: event.blob,
      }));
    case "compose/attach-failed":
      return mapAttachment(state, event.id, (attachment) => ({
        ...attachment,
        uploading: false,
        error: event.error,
      }));
    case "compose/warning-toggle":
      if (state.sending) return state;
      return {
        ...state,
        contentWarning: state.contentWarning === undefined ? "" : undefined,
      };
    case "compose/warning-input":
      return state.sending || state.contentWarning === undefined
        ? state
        : { ...state, contentWarning: event.reason };
    case "compose/load":
      if (state.sending) return state;
      return {
        ...emptyCompose(),
        content: event.draft.content,
        contentWarning: event.draft.contentWarning,
        draft: { id: event.draft.id, kept: event.draft.kept },
      };
    case "compose/draft-bound":
      return { ...state, draft: { id: event.id, kept: event.kept } };
    case "compose/reset":
      return state.sending ? state : emptyCompose();
  }
};
