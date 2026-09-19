import { buildUserColumn } from "@streets/core/deck/column-presets";
import { parseProfile } from "@streets/core/nostr/profile";
import { type Component, Show, createMemo } from "solid-js";
import UserCardHover from "../profile/UserCardHover";
import { useDispatch } from "../ui-events";
import type { EventSize } from "./Event";
import { ProfileName, ProfileText } from "./Name";
import { useProfileEvent } from "./use-profile";

/** 表示名と `@name`。触れると名刺、押すとその人のカラムを重ねる。 */
const AuthorNames: Component<{ pubkey: string; size: EventSize }> = (props) => {
  const profileEvent = useProfileEvent(() => props.pubkey);
  const profile = createMemo(() => {
    const event = profileEvent();
    return event ? parseProfile(event.content) : undefined;
  });
  const dispatch = useDispatch();
  return (
    <UserCardHover
      pubkey={props.pubkey}
      trigger={(triggerProps) => (
        <button
          {...triggerProps({
            type: "button",
            class:
              "flex w-fit max-w-full items-end gap-1.5 bg-transparent text-left enabled:cursor-pointer enabled:hover:underline",
            onClick: () =>
              dispatch({
                type: "stack/open",
                column: buildUserColumn(props.pubkey),
              }),
          })}
        >
          <span
            class="c-primary truncate font-600"
            classList={{
              "text-body": props.size === "normal",
              "text-[14px]": props.size === "compact",
            }}
          >
            <ProfileName
              pubkey={props.pubkey}
              profile={profile()}
              tags={profileEvent()?.tags}
            />
          </span>
          {/* display_name が無いと太字側が name に落ちるので、同じ文字列を 2 回並べない。 */}
          <Show when={profile()?.displayName && profile()?.name}>
            {(name) => (
              <span class="c-secondary min-w-0 truncate text-caption">
                @<ProfileText text={name()} tags={profileEvent()?.tags} />
              </span>
            )}
          </Show>
        </button>
      )}
    />
  );
};

export default AuthorNames;
