import type { BlobDescriptor } from "../media/blossom";
import { appendMediaUrl } from "../nostr/build/media";

/** 預けている途中・預けられなかったファイル。預け終わったものは本文の URL になる。 */
export type Upload = {
  id: string;
  name: string;
  /** 預けられなかった理由。あれば失敗として出す。 */
  error?: string;
};

/** 投稿・返信の書きかけ。 */
export type ComposeState = {
  content: string;
  /** 送っている間は、本文を変えさせず、もう一度送らせない。 */
  sending: boolean;
  /** 預けている途中と、失敗したファイル。 */
  uploads: Upload[];
  /** 預け終わったファイル。本文に URL が残っているものだけを投稿に添える。 */
  media: BlobDescriptor[];
};

export type ComposeEvent =
  | { type: "compose/input"; content: string }
  | { type: "compose/submit" }
  /** 送れた。本文を空にする。 */
  | { type: "compose/sent" }
  /** 送れなかった。本文は残して、そのまま送り直せるようにする。 */
  | { type: "compose/failed" }
  /** ファイルを預け始めた。 */
  | { type: "compose/attach-start"; id: string; name: string }
  /** 預け終わった。本文の末尾に URL を足す。 */
  | { type: "compose/attach-done"; id: string; blob: BlobDescriptor }
  | { type: "compose/attach-failed"; id: string; error: string }
  /** 失敗したものを一覧から消す（本文には何も足していない）。 */
  | { type: "compose/attach-dismiss"; id: string };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyCompose = (): ComposeState => ({
  content: "",
  sending: false,
  uploads: [],
  media: [],
});

/** 預けている途中のファイルがあるか。ある間は送らせない（URL が本文に入らないまま出てしまう）。 */
export const isUploading = (state: ComposeState): boolean =>
  state.uploads.some((upload) => upload.error === undefined);

/**
 * 投稿に添えるファイル。本文から URL を消したものは添えない —— 本文に無い画像の
 * 情報だけが付いていると、読む側が出せない画像のことを知らされる。
 */
export const composeMedia = (state: ComposeState): BlobDescriptor[] =>
  state.media.filter((blob) => state.content.includes(blob.url));

/**
 * 送れる本文。前後の空白だけのとき・送っている途中・ファイルを預けている途中は
 * 送らない。
 */
export const sendableText = (state: ComposeState): string | undefined => {
  if (state.sending || isUploading(state)) return undefined;
  const text = state.content.trim();
  return text.length > 0 ? text : undefined;
};

export const composeTransition = (
  state: ComposeState,
  event: ComposeEvent,
): ComposeState => {
  switch (event.type) {
    case "compose/input":
      return state.sending ? state : { ...state, content: event.content };
    case "compose/submit":
      return sendableText(state) === undefined
        ? state
        : { ...state, sending: true };
    case "compose/sent":
      return state.sending ? emptyCompose() : state;
    case "compose/failed":
      return state.sending ? { ...state, sending: false } : state;
    case "compose/attach-start":
      return {
        ...state,
        uploads: [...state.uploads, { id: event.id, name: event.name }],
      };
    case "compose/attach-done":
      return {
        ...state,
        uploads: state.uploads.filter((upload) => upload.id !== event.id),
        media: [...state.media, event.blob],
        content: appendMediaUrl(state.content, event.blob.url),
      };
    case "compose/attach-failed":
      return {
        ...state,
        uploads: state.uploads.map((upload) =>
          upload.id === event.id ? { ...upload, error: event.error } : upload,
        ),
      };
    case "compose/attach-dismiss":
      return {
        ...state,
        uploads: state.uploads.filter((upload) => upload.id !== event.id),
      };
  }
};
