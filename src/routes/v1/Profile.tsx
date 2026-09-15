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
 * 1 人分の名前を出す。取得は `<Avatar>` と共有する。見た目は `variant` で
 * 決め、呼び出し側に `class` の穴は開けない —— 見た目の契約を共有するため。
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
