import { Menu } from "@ark-ui/solid/menu";
import { threadMuteTarget } from "@streets/core/moderation/mute-list";
import type { MuteTarget } from "@streets/core/nostr/build/mute";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeBech32 } from "@streets/core/nostr/nip19";
import { type Component, For, Show, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import AuthorRelaysDialog from "../profile/AuthorRelaysDialog";
import { useMutes } from "../settings/MuteMediator";
import { useDispatch } from "../ui-events";
import EventDetailsDialog from "./EventDetailsDialog";
import { ProfileName, ProfileText } from "./Name";
import { useProfileDetails } from "./use-profile";

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
];

const AUTHOR_ITEMS: MenuItem[] = [
  {
    value: "follow",
    label: "フォロー",
    icon: "i-material-symbols:person-add-outline-rounded",
    todo: true,
  },
  {
    value: "author-relays",
    label: "リレー設定",
    icon: "i-material-symbols:hub-outline",
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
  const profileDetails = useProfileDetails(() => props.event.pubkey);
  const profile = () => profileDetails()?.profile;
  const dispatch = useDispatch();
  const mutes = useMutes();
  const viewer = useEventActions()?.viewer;
  const mine = () => props.event.pubkey === viewer;
  // ミュートは今の状態で出し分ける。スレッドやその人のページでは、ミュートした
  // 投稿も出ているので、そこから解除できるようにする。
  const mutedEntry = (target: MuteTarget) =>
    mutes
      ?.entries()
      .find(
        (entry) =>
          entry.target.type === target.type &&
          entry.target.value === target.value,
      );
  const threadTarget = () => threadMuteTarget(props.event);
  const authorTarget = (): MuteTarget => ({
    type: "pubkey",
    value: props.event.pubkey,
  });
  const eventItems = (): MenuItem[] => {
    const muted = mutedEntry(threadTarget()) !== undefined;
    return [
      ...EVENT_ITEMS,
      {
        value: "mute-event",
        label: muted
          ? "このイベントのミュートを解除"
          : "このイベントをミュート",
        icon: muted
          ? "i-material-symbols:volume-up-outline-rounded"
          : "i-material-symbols:volume-off-outline-rounded",
        todo: mutes === undefined,
      },
    ];
  };
  const authorItems = (): MenuItem[] => {
    // 自分をミュートしても、自分の投稿は隠さない。押せても意味が無いので出さない。
    if (mine()) return AUTHOR_ITEMS;
    const muted = mutedEntry(authorTarget()) !== undefined;
    const [follow, ...rest] = AUTHOR_ITEMS;
    return [
      ...(follow ? [follow] : []),
      {
        value: "mute-author",
        label: muted ? "ミュートを解除" : "ミュート",
        icon: muted
          ? "i-material-symbols:person-outline-rounded"
          : "i-material-symbols:person-off-outline-rounded",
        todo: mutes === undefined,
      },
      ...rest,
    ];
  };
  const toggleMute = (target: MuteTarget) => {
    const entry = mutedEntry(target);
    dispatch(
      entry ? { type: "mutes/remove", entry } : { type: "mutes/add", target },
    );
  };
  const [details, setDetails] = createSignal(false);
  const [authorRelays, setAuthorRelays] = createSignal(false);
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
      {/*
        閉じている間は中身を作らない。投稿 1 件ごとにメニューがあるので、
        作り続けるとカラム 1 本で DOM が 200 要素単位で増える。
      */}
      <Menu.Root
        lazyMount
        unmountOnExit
        onSelect={(details) => {
          if (details.value === "copy-link") void copyLink();
          if (details.value === "details") setDetails(true);
          if (details.value === "author-relays") setAuthorRelays(true);
          if (details.value === "mute-event") toggleMute(threadTarget());
          if (details.value === "mute-author") toggleMute(authorTarget());
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
            <Menu.Content class="motion-pop c-primary w-70 space-y-1 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel class="c-secondary block px-2.5 py-0.5 font-600 text-caption">
                  このイベント
                </Menu.ItemGroupLabel>
                <Items items={eventItems()} />
              </Menu.ItemGroup>
              <Menu.Separator class="border-primary border-t" />
              <Menu.ItemGroup>
                <Menu.ItemGroupLabel class="c-secondary block truncate px-2.5 py-0.5 font-600 text-caption">
                  <ProfileName
                    pubkey={props.event.pubkey}
                    profile={profile()}
                    tags={profileDetails()?.tags}
                  />
                  <Show when={profile()?.name}>
                    {(name) => (
                      <>
                        {" @"}
                        <ProfileText
                          text={name()}
                          tags={profileDetails()?.tags}
                        />
                      </>
                    )}
                  </Show>
                </Menu.ItemGroupLabel>
                <Items items={authorItems()} />
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
      <Show when={authorRelays()}>
        <AuthorRelaysDialog
          pubkey={props.event.pubkey}
          onClose={() => setAuthorRelays(false)}
        />
      </Show>
    </span>
  );
};

export default EventMenu;
