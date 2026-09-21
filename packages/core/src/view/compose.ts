import type { BlobDescriptor } from "../media/blossom";

/**
 * 書きかけに添えたファイル。中身（File）はアプリ側が持ち、ここには見せ方と
 * 預けた結果だけを置く。預けるのは送るときなので、書いている間はまだどこにも
 * 送っていない —— 切り抜いてから預けられるし、書くのをやめれば何も残らない。
 */
export type Attachment = {
  id: string;
  name: string;
  /** 手元で作った見本の URL。 */
  preview: string;
  /** ファイルの種類（`image/jpeg` など）。切り抜いた結果の種類を決めるのに使う。 */
  type?: string;
  /** 預け終わったもの。切り抜くと預け直しになるので消える。 */
  blob?: BlobDescriptor;
  uploading?: boolean;
  /** 預けられなかった理由。 */
  error?: string;
};

/** 投稿・返信の書きかけ。 */
export type ComposeState = {
  content: string;
  /** 送っている間は、本文を変えさせず、もう一度送らせない。 */
  sending: boolean;
  /** 添えたファイル。並び順がそのまま本文に並ぶ順になる。 */
  attachments: Attachment[];
};

export type ComposeEvent =
  | { type: "compose/input"; content: string }
  | { type: "compose/submit" }
  /** 送れた。本文を空にする。 */
  | { type: "compose/sent" }
  /** 送れなかった。本文は残して、そのまま送り直せるようにする。 */
  | { type: "compose/failed" }
  /** ファイルを添えた（まだ預けていない）。 */
  | {
      type: "compose/attach-add";
      id: string;
      name: string;
      preview: string;
      /** ファイルの種類。 */
      mime?: string;
    }
  | { type: "compose/attach-remove"; id: string }
  /** 並べ替える。`to` は動かした先の位置。 */
  | { type: "compose/attach-move"; id: string; to: number }
  /** 切り抜いた見本に差し替える。預け直しになる。 */
  | {
      type: "compose/attach-cropped";
      id: string;
      preview: string;
      mime?: string;
    }
  | { type: "compose/attach-uploading"; id: string }
  | { type: "compose/attach-done"; id: string; blob: BlobDescriptor }
  | { type: "compose/attach-failed"; id: string; error: string };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyCompose = (): ComposeState => ({
  content: "",
  sending: false,
  attachments: [],
});

/** まだ預けていないファイル。送るときに、この順で預ける。 */
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
      // 送り直すときは、前に失敗した理由を消してから預け直す。
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
    case "compose/attach-cropped":
      return mapAttachment(state, event.id, (attachment) => ({
        ...attachment,
        preview: event.preview,
        type: event.mime ?? attachment.type,
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
  }
};
