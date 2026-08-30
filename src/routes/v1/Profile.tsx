import { Show } from "solid-js";
import type { Component } from "solid-js";
import type { EventStore } from "../../core/read/event-store";
import type { ProfileRequests } from "../../core/read/profile-requests";
import ProfileHover from "./ProfileHover";
import { useOptionalColumnNavigation } from "./column-navigation";
import { npubLabel } from "./npub-label";
import { useProfileData } from "./profile-data";
import { useProfileHoverSuppressed } from "./profile-hover-context";

export type ProfileVariant = "author" | "inline" | "list";

export type ProfileProps = {
  pubkey: string;
  store: EventStore;
  requests: ProfileRequests;
  variant?: ProfileVariant;
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
 * - `list` —— ユーザー一覧。2 段をそれぞれ 1 行で省略
 *
 * 太字にしたい・幅を制限したい呼び出し側 (リポスト/リアクションの見出し
 * など) は、`<Profile>` 自体を書き換えずに外側を `<span class="min-w-0
 * truncate font-700">` などで包む (`Note.tsx` の `note-author` と同じ手筋)。
 * `<Profile>` は他の言及・アバター横の使われ方と見た目の契約を共有して
 * いるので、ここへ `class` 等の穴を空けて呼び出し側ごとに変えない。
 */
const ProfileName: Component<{
  pubkey: string;
  displayName?: string;
  name?: string;
  variant?: ProfileVariant;
}> = (props) => {
  const displayName = () => props.displayName;
  const name = () => props.name;

  return (
    <Show
      when={props.variant === "author" || props.variant === "list"}
      fallback={
        <span data-testid="profile">
          <span data-testid="profile-name" class="break-all">
            @{name() || displayName() || npubLabel(props.pubkey)}
          </span>
        </span>
      }
    >
      <span
        data-testid="profile"
        classList={{
          "flex min-w-0 max-w-full flex-col items-start overflow-hidden":
            props.variant === "list",
        }}
      >
        <span
          data-testid="profile-name"
          class="font-500"
          classList={{
            "break-all": props.variant === "author",
            "w-full truncate": props.variant === "list",
          }}
          title={displayName() || name() || npubLabel(props.pubkey)}
        >
          {displayName() || name() || npubLabel(props.pubkey)}
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
          <span
            data-testid="profile-handle"
            class="c-secondary font-400"
            classList={{
              "break-all": props.variant === "author",
              "w-full truncate": props.variant === "list",
            }}
            title={`@${name()}`}
          >
            @{name()}
          </span>
        </Show>
      </span>
    </Show>
  );
};

const Profile: Component<ProfileProps> = (props) => {
  const profile = useProfileData(
    () => props.pubkey,
    props.store,
    props.requests,
  );
  const suppressed = useProfileHoverSuppressed();
  const navigation = useOptionalColumnNavigation();

  return (
    <Show
      when={!suppressed}
      fallback={
        <ProfileName
          pubkey={props.pubkey}
          displayName={profile()?.displayName}
          name={profile()?.name}
          variant={props.variant}
        />
      }
    >
      <ProfileHover
        pubkey={props.pubkey}
        onClick={(event) => {
          if (!navigation) return;
          event.stopPropagation();
          navigation.openUser(props.pubkey);
        }}
      >
        <ProfileName
          pubkey={props.pubkey}
          displayName={profile()?.displayName}
          name={profile()?.name}
          variant={props.variant}
        />
      </ProfileHover>
    </Show>
  );
};

export default Profile;
