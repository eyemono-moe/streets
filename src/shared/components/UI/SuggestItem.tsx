import { Image } from "@kobalte/core/image";
import { type Component, Match, Switch, createEffect } from "solid-js";

export type EmojiSuggest = {
  type: "emoji";
  name: string;
  url: string;
};

export type UserSuggest = {
  type: "user";
  name: string;
  displayName?: string;
  url?: string;
};

export type SuggestType = EmojiSuggest | UserSuggest;

export type SuggestItemProps = {
  item: EmojiSuggest | UserSuggest;
  highlighted: boolean;
  onSelect: () => void;
};

const SuggestItem: Component<SuggestItemProps> = (props) => {
  let containerRef: HTMLLIElement | undefined;

  createEffect(() => {
    if (props.highlighted && containerRef) {
      containerRef.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });

  return (
    <li ref={containerRef}>
      <div
        class="cursor-pointer rounded px-1 py-0.5 hover:bg-alpha-hover aria-[selected=true]:bg-alpha-hover"
        aria-selected={props.highlighted}
        // onClickにするとフォーカスが外れてしまうので、onMouseDownにしている
        onMouseDown={(e) => {
          e.preventDefault();
          props.onSelect();
        }}
      >
        <Switch>
          <Match when={props.item.type === "emoji" && props.item}>
            {(emoji) => (
              <div class="flex items-center gap-1">
                <img
                  src={emoji().url}
                  alt={emoji().name}
                  class="h-8 w-8 object-contain"
                />
                <span
                  class="truncate text-caption"
                  classList={{
                    "font-700": props.highlighted,
                  }}
                >
                  {emoji().name}
                </span>
              </div>
            )}
          </Match>
          <Match when={props.item.type === "user" && props.item}>
            {(user) => (
              <div class="flex items-center gap-1">
                <Image
                  class="inline-flex h-8 w-8 shrink-0 select-none items-center justify-center overflow-hidden rounded bg-secondary align-mid"
                  fallbackDelay={500}
                >
                  <Image.Img
                    src={user().url}
                    alt={user().name}
                    loading="lazy"
                    class="h-full w-full object-cover"
                  />
                  <Image.Fallback class="flex h-full w-full items-center justify-center">
                    {user().name.slice(0, 2)}
                  </Image.Fallback>
                </Image>
                <div
                  class="truncate text-caption"
                  classList={{
                    "font-700": props.highlighted,
                  }}
                >
                  <span>{user().displayName}</span>
                  <span class="c-secondary">@{user().name}</span>
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </div>
    </li>
  );
};

export default SuggestItem;
