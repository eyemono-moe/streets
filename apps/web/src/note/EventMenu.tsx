import { Menu } from "@ark-ui/solid/menu";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { type Component, For, Show, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import EventDetailsDialog from "./EventDetailsDialog";
import Name from "./Name";
import { useProfile } from "./use-profile";

type MenuItem = {
  value: string;
  label: string;
  icon: string;
  danger?: boolean;
  /** まだ作っていない操作。押せる見た目にすると壊れて見えるので出さない。 */
  todo?: boolean;
};

const EVENT_ITEMS: MenuItem[] = [
  {
    value: "copy-link",
    label: "リンクをコピー",
    icon: "i-material-symbols:link-rounded",
  },
  {
    value: "details",
    label: "詳細（JSON・リレー）",
    icon: "i-material-symbols:code-rounded",
  },
  {
    value: "mute-note",
    label: "このノートをミュート",
    icon: "i-material-symbols:volume-off-outline-rounded",
    todo: true,
  },
];

const AUTHOR_ITEMS: MenuItem[] = [
  {
    value: "follow",
    label: "フォロー",
    icon: "i-material-symbols:person-add-outline-rounded",
    todo: true,
  },
  {
    value: "mute-author",
    label: "ミュート",
    icon: "i-material-symbols:person-off-outline-rounded",
    todo: true,
  },
  {
    value: "block",
    label: "ブロック",
    icon: "i-material-symbols:block",
    danger: true,
    todo: true,
  },
  {
    value: "report",
    label: "通報",
    icon: "i-material-symbols:flag-outline-rounded",
    danger: true,
    todo: true,
  },
];

const Items: Component<{ items: MenuItem[] }> = (props) => (
  <For each={props.items}>
    {(item) => (
      <Menu.Item
        value={item.value}
        disabled={item.todo}
        class="flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body enabled:cursor-pointer data-[highlighted]:bg-secondary data-[disabled]:opacity-50"
        classList={{ "c-danger": item.danger }}
      >
        <span class={`${item.icon} size-4.5 shrink-0`} aria-hidden="true" />
        <span class="truncate">{item.label}</span>
      </Menu.Item>
    )}
  </For>
);

/**
 * 投稿の右上のメニュー。kind によらず出せる操作を置く。
 * まだ作っていない操作は押せない状態で並べ、どこに来るかだけ分かるようにする。
 */
const EventMenu: Component<{ event: NostrEvent }> = (props) => {
  const profile = useProfile(() => props.event.pubkey);
  const [details, setDetails] = createSignal(false);
  const [notice, setNotice] = createSignal<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));

  const flash = (message: string) => {
    setNotice(message);
    clearTimeout(timer);
    timer = setTimeout(() => setNotice(undefined), 3000);
  };

  const copyLink = async () => {
    // TLV を持つ `nevent` の符号化器がまだ無いので、id だけの `note` で参照する。
    const uri = `nostr:${encodeBech32("note", props.event.id)}`;
    try {
      await navigator.clipboard.writeText(uri);
      flash("リンクをコピーしました");
    } catch {
      // 非セキュアな接続や権限拒否で失敗する。黙って何も起きないと壊れて見える。
      flash("コピーできませんでした");
    }
  };

  return (
    <span class="relative shrink-0">
      <Menu.Root
        onSelect={(details) => {
          if (details.value === "copy-link") void copyLink();
          if (details.value === "details") setDetails(true);
        }}
      >
        <Menu.Trigger
          aria-label="この投稿の操作"
          class="c-secondary grid size-6 cursor-pointer place-items-center rounded-1.5 bg-transparent hover:bg-secondary"
        >
          <span
            class="i-material-symbols:more-vert size-4.5"
            aria-hidden="true"
          />
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content class="c-primary flex w-70 flex-col gap-1 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel class="c-secondary block px-2.5 py-0.5 font-600 text-caption">
                  このイベント
                </Menu.ItemGroupLabel>
                <Items items={EVENT_ITEMS} />
              </Menu.ItemGroup>
              <Menu.Separator class="border-primary border-t" />
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel class="c-secondary block truncate px-2.5 py-0.5 font-600 text-caption">
                  <Name pubkey={props.event.pubkey} />
                  <Show when={profile()?.name}>{(name) => ` @${name()}`}</Show>
                </Menu.ItemGroupLabel>
                <Items items={AUTHOR_ITEMS} />
              </Menu.ItemGroup>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      <Show when={notice()}>
        {(message) => (
          <output class="c-secondary absolute top-full right-0 z-10 whitespace-nowrap rounded-1.5 border border-primary bg-primary px-2 py-0.5 text-caption">
            {message()}
          </output>
        )}
      </Show>
      <Show when={details()}>
        <EventDetailsDialog
          event={props.event}
          onClose={() => setDetails(false)}
        />
      </Show>
    </span>
  );
};

export default EventMenu;
