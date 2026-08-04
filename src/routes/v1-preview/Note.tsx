import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";

export type NoteProps = {
  event: NostrEvent;
};

/**
 * kind:1 を 1 件描画する。表示は本文・created_at・著者の短縮 pubkey だけ
 * (spec 2 節の「カラム描画は kind:1 用コンポーネント 1 つを直に書く」)。
 *
 * **プロフィールはまだ出さない。** 著者名の解決は 4 節のコアレッサ
 * (Task 5) の仕事で、このタスクの範囲外。ここでは常に hex pubkey の先頭
 * だけを表示する。
 */
const Note: Component<NoteProps> = (props) => {
  return (
    <article
      data-testid="note"
      class="space-y-1 rounded-2 border border-alpha-300 p-3 text-sm"
    >
      <p data-testid="note-author" class="break-all text-alpha-600 text-xs">
        {props.event.pubkey.slice(0, 8)}…
      </p>
      <p data-testid="note-content" class="whitespace-pre-wrap break-words">
        {props.event.content}
      </p>
      <p data-testid="note-created-at" class="text-alpha-600 text-xs">
        {props.event.created_at}
      </p>
    </article>
  );
};

export default Note;
