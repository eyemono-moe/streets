import { Show } from "solid-js";
import type { Component } from "solid-js";
import { encodeBech32 } from "../../core/nostr/nip19";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import { useProfileData } from "./profile-data";

export type ProfileVariant = "author" | "inline";

export type ProfileProps = {
  pubkey: string;
  store: EventStore;
  requests: ProfileRequests;
  variant?: ProfileVariant;
};

/**
 * 名前が無いときに出す代わりの文字列 (spec 3 節)。`encodeBech32` は 64 桁
 * hex 以外で投げるが、pubkey は NIP-10 の `e` タグ 5 番目の要素など**リレー
 * 由来の任意文字列**から来ることがある —— 投げさせるとカラム全体が落ちる
 * (`<For>` の周りに ErrorBoundary が無い) ので、hex として読めない値は
 * 短縮 hex のまま出す。
 */
const fallbackLabel = (pubkey: string): string => {
  try {
    return encodeBech32("npub", pubkey).slice(0, 12);
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
};

/**
 * 1 人分の名前を出す (アイコンは `Avatar.tsx` が別領域として担う ——
 * spec 3 節)。取得ロジックは `<Avatar>` と共有 (`profile-data.ts`):
 * マウント時に自分の pubkey を `requests.request()` で 1 件だけ要求する ——
 * カラム側で著者集合をまとめるのではなく、ここが要求の最小単位 (spec 4 節)。
 * まとめるのはコアレッサ (`profile-requests.ts`) の仕事であり、この
 * コンポーネントは他の `<Profile>`/`<Avatar>` の存在を一切知らない。
 *
 * v0 は同じ人物を 2 通りに書き分けており (`EventBase.tsx` / `RichContents`)、
 * それを `variant` として写す:
 *
 * - `author` —— イベントの著者行。`display_name` + `@name` の 2 段
 * - `inline` —— 本文中の言及・返信先。`@name` の 1 つだけ (既定)
 */
const Profile: Component<ProfileProps> = (props) => {
  const profile = useProfileData(
    () => props.pubkey,
    props.store,
    props.requests,
  );

  const displayName = () => profile()?.displayName;
  const name = () => profile()?.name;

  return (
    <Show
      when={props.variant === "author"}
      fallback={
        <span data-testid="profile">
          <span data-testid="profile-name" class="break-all">
            @{name() || displayName() || fallbackLabel(props.pubkey)}
          </span>
        </span>
      }
    >
      <span data-testid="profile">
        <span data-testid="profile-name" class="break-all font-500">
          {displayName() || name() || fallbackLabel(props.pubkey)}
        </span>
        {/*
          `@name` は太字側が `display_name` を出せているときだけ添える ——
          `display_name` が無い kind:0 では太字側が `name` へ落ちるので、
          両方出すと同じ文字列が 2 度並ぶ。
        */}
        <Show when={displayName() && name()}>
          {/*
            文字サイズは名前と同じ (親から継承)。変えるのは太さと色だけ ——
            並べたときに 2 段に見えず 1 行として読める。
          */}
          <span class="c-secondary break-all font-400">@{name()}</span>
        </Show>
      </span>
    </Show>
  );
};

export default Profile;
