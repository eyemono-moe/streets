import type { Component } from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import Profile from "./Profile";

export type NoteProps = {
  event: NostrEvent;
  store: EventStore;
  profileRequests: ProfileRequests;
};

/**
 * kind:1 を 1 件描画する。表示は本文・created_at・著者プロフィールだけ
 * (spec 2 節の「カラム描画は kind:1 用コンポーネント 1 つを直に書く」)。
 *
 * 著者名の解決は `<Profile>` (spec 4 節のコアレッサ, Task 5) に委ねる ——
 * ここでは著者集合をまとめない。`<Profile>` がマウントごとに 1 件だけ
 * 要求し、まとめるのはコアレッサの仕事 (N+1 を作らないための境界)。
 */
const Note: Component<NoteProps> = (props) => {
  return (
    <article
      data-testid="note"
      class="space-y-1 rounded-2 border border-alpha-300 p-3 text-sm"
    >
      <p data-testid="note-author" class="text-alpha-600 text-xs">
        <Profile
          pubkey={props.event.pubkey}
          store={props.store}
          requests={props.profileRequests}
        />
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
