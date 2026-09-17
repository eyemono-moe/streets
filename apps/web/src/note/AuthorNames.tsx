import { buildUserColumn } from "@streets/core/deck/column-presets";
import { profileLabel } from "@streets/core/nostr/profile";
import { type Component, Show } from "solid-js";
import { useColumnStack } from "../deck/column-stack";
import type { EventSize } from "./Event";
import { useProfile } from "./use-profile";

/** 表示名と `@name`。押すとその人のカラムを重ねる。 */
const AuthorNames: Component<{ pubkey: string; size: EventSize }> = (props) => {
  const profile = useProfile(() => props.pubkey);
  const stack = useColumnStack();
  return (
    <button
      type="button"
      class="flex min-w-0 flex-1 items-end gap-1.5 bg-transparent text-left enabled:cursor-pointer enabled:hover:underline"
      disabled={stack === undefined}
      onClick={() => stack?.push(buildUserColumn(props.pubkey))}
    >
      <span
        class="c-primary truncate font-600"
        classList={{
          "text-body": props.size === "normal",
          "text-[14px]": props.size === "compact",
        }}
      >
        {profileLabel(profile(), props.pubkey)}
      </span>
      {/* display_name が無いと太字側が name に落ちるので、同じ文字列を 2 回並べない。 */}
      <Show when={profile()?.displayName && profile()?.name}>
        {(name) => (
          <span class="c-secondary min-w-0 truncate text-caption">
            @{name()}
          </span>
        )}
      </Show>
    </button>
  );
};

export default AuthorNames;
