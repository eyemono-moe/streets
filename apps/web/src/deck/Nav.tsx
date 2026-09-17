import { type Component, For } from "solid-js";
import { useDispatch } from "../ui-events";
import AccountMenu from "./AccountMenu";

/**
 * まだどこへも移動できないので、並びだけを置く。押せる見た目にすると、
 * 「押しても何も起きない」と「壊れている」の区別が付かなくなる。
 */
const NAV_ITEMS = [
  { label: "ホーム", icon: "i-material-symbols:home-outline-rounded" },
  { label: "検索", icon: "i-material-symbols:search-rounded" },
  { label: "通知", icon: "i-material-symbols:notifications-outline-rounded" },
  {
    label: "ブックマーク",
    icon: "i-material-symbols:bookmark-outline-rounded",
  },
];

const NavButton: Component<{
  label: string;
  icon: string;
  size: "sidebar" | "tabbar";
}> = (props) => (
  <button
    type="button"
    aria-label={`${props.label}（未対応）`}
    class="c-secondary grid place-items-center bg-transparent opacity-50"
    classList={{
      "size-10 rounded-2": props.size === "sidebar",
      "h-11 w-6": props.size === "tabbar",
    }}
    disabled
  >
    <span
      class={props.icon}
      classList={{
        "size-5.5": props.size === "sidebar",
        "size-6": props.size === "tabbar",
      }}
      aria-hidden="true"
    />
  </button>
);

export const Sidebar: Component<{
  pubkey: string;
  onLogout: () => void;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <nav class="flex w-14 shrink-0 flex-col items-center gap-1 bg-primary px-2 py-2.5">
      <button
        type="button"
        aria-label="ノートを書く"
        class="grid size-10 cursor-pointer place-items-center rounded-2 bg-accent-primary hover:bg-accent-hover"
        onClick={() => dispatch({ type: "deck/open-panel", panel: "compose" })}
      >
        <span
          class="i-material-symbols:edit-square-outline-rounded c-white size-5.5"
          aria-hidden="true"
        />
      </button>
      <For each={NAV_ITEMS}>
        {(item) => (
          <NavButton label={item.label} icon={item.icon} size="sidebar" />
        )}
      </For>
      <button
        type="button"
        aria-label="カラムを追加"
        class="c-secondary grid size-10 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
        onClick={() =>
          dispatch({ type: "deck/open-panel", panel: "add-column" })
        }
      >
        <span
          class="i-material-symbols:add-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      <span class="flex-1" />
      <button
        type="button"
        aria-label="設定"
        class="c-secondary grid size-10 cursor-pointer place-items-center rounded-2 bg-transparent hover:bg-secondary"
        onClick={() => dispatch({ type: "deck/open-settings" })}
      >
        <span
          class="i-material-symbols:settings-outline-rounded size-5.5"
          aria-hidden="true"
        />
      </button>
      <AccountMenu pubkey={props.pubkey} onLogout={props.onLogout} />
    </nav>
  );
};

/** 狭い画面の右下に浮かぶ、ノートを書くボタン。 */
export const ComposeFab: Component = () => {
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      aria-label="ノートを書く"
      class="absolute right-4 bottom-20 grid size-14 cursor-pointer place-items-center rounded-full bg-accent-primary shadow-lg hover:bg-accent-hover"
      onClick={() => dispatch({ type: "deck/open-panel", panel: "compose" })}
    >
      <span
        class="i-material-symbols:edit-square-outline-rounded c-white size-6"
        aria-hidden="true"
      />
    </button>
  );
};

export const TabBar: Component<{ pubkey: string; onLogout: () => void }> = (
  props,
) => (
  <nav class="flex shrink-0 items-center justify-between bg-primary px-5 pb-2.5">
    <For each={NAV_ITEMS}>
      {(item) => (
        <NavButton label={item.label} icon={item.icon} size="tabbar" />
      )}
    </For>
    <AccountMenu pubkey={props.pubkey} onLogout={props.onLogout} />
  </nav>
);
