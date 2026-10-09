import { buildRelayColumn } from "@streets/core/deck/column-presets";
import {
  BOOKMARK_SET_KIND,
  CURATION_SET_KIND,
  INTEREST_SET_KIND,
  type ListSet,
  MEDIA_STARTER_PACK_KIND,
  PICTURE_SET_KIND,
  RELAY_SET_KIND,
  STARTER_PACK_KIND,
  VIDEO_SET_KIND,
  readListSet,
} from "@streets/core/lists/list-set";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { relayLabel } from "@streets/core/settings/relay-edit";
import { type Component, For, type JSX, Show, createSignal } from "solid-js";
import Avatar from "../note/Avatar";
import { type EventSize, EventRefView } from "../note/Event";
import QuoteBox from "../note/QuoteBox";
import RelaySummary from "../settings/RelaySummary";
import RelayUseButton from "../settings/RelayUseButton";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { MEMBER_FACES } from "./FollowSetSummary";
import ListRow from "./ListRow";

type CardProps = { event: NostrEvent; size: EventSize };

/** 先に並べるリレーの数。多いリストでも、どんなリレーの集まりかが分かれば足りる。 */
const FIRST_RELAYS = 3;

const RelayRow: Component<{ url: RelayUrl }> = (props) => {
  const dispatch = useDispatch();
  return (
    <li class="bg-primary">
      <RelaySummary
        url={props.url}
        actions={
          <div class="ml-auto flex items-center gap-1">
            <IconButton
              icon="i-material-symbols:open-in-new-rounded"
              label={`${relayLabel(props.url)} をデッキのカラムとして足す`}
              onClick={() => {
                const column = buildRelayColumn([props.url]);
                if (column) dispatch({ type: "deck/add-column", column });
              }}
            />
            <RelayUseButton url={props.url} />
          </div>
        }
      />
    </li>
  );
};

const RelayList: Component<{ relays: readonly RelayUrl[] }> = (props) => {
  const [showAll, setShowAll] = createSignal(false);
  const rest = () => props.relays.length - FIRST_RELAYS;
  return (
    <div class="flex flex-col items-start gap-1">
      <ul class="flex w-full flex-col overflow-hidden rounded-2 border border-primary [&>*+*]:border-t [&>*]:border-primary">
        <For
          each={showAll() ? props.relays : props.relays.slice(0, FIRST_RELAYS)}
        >
          {(url) => <RelayRow url={url} />}
        </For>
      </ul>
      <Show when={!showAll() && rest() > 0}>
        <Button
          variant="ghost"
          size="sm"
          icon="i-material-symbols:expand-more-rounded"
          onClick={() => setShowAll(true)}
        >
          {`ほか ${rest()} 個`}
        </Button>
      </Show>
    </div>
  );
};

/** 引用の中では、どのリレーが入っているかだけを 1 行で見せる。 */
const RelayNames: Component<{ relays: readonly RelayUrl[] }> = (props) => (
  <p class="c-secondary break-all text-caption">
    {props.relays
      .map((url) => relayLabel(url).replace(/^wss?:\/\//, ""))
      .join("、")}
  </p>
);

const Faces: Component<{ pubkeys: readonly string[] }> = (props) => (
  <span class="flex items-center gap-1" aria-hidden="true">
    <For each={props.pubkeys.slice(0, MEMBER_FACES)}>
      {(pubkey) => <Avatar pubkey={pubkey} size="tiny" static />}
    </For>
  </span>
);

/** 先頭の 1 件を引用と同じ形で出し、残りは数だけにする。 */
const FirstEvent: Component<{ set: ListSet }> = (props) => (
  <Show when={props.set.events[0]}>
    {(first) => (
      <div class="flex flex-col gap-1">
        <QuoteBox>
          <EventRefView target={first()} size="compact" gateMuted />
        </QuoteBox>
        <Show when={props.set.events.length > 1}>
          <span class="c-secondary text-caption">
            ほか {props.set.events.length - 1} 件
          </span>
        </Show>
      </div>
    )}
  </Show>
);

type ListKind = {
  icon: string;
  /** 題名の無いリストの呼び名。 */
  name: string;
  count: (set: ListSet) => string;
  /** 題名の下に足す中身。引用の中（compact）では足さない。 */
  body?: (set: ListSet) => JSX.Element;
  /** 引用の中で足す中身。 */
  compactBody?: (set: ListSet) => JSX.Element;
};

const eventCount = (set: ListSet) => `${set.events.length} 件`;
const people = (set: ListSet) => `${set.pubkeys.length} 人`;

type ListSetKind =
  | typeof RELAY_SET_KIND
  | typeof BOOKMARK_SET_KIND
  | typeof CURATION_SET_KIND
  | typeof VIDEO_SET_KIND
  | typeof PICTURE_SET_KIND
  | typeof INTEREST_SET_KIND
  | typeof STARTER_PACK_KIND
  | typeof MEDIA_STARTER_PACK_KIND;

const LIST_KINDS: Record<ListSetKind, ListKind> = {
  [RELAY_SET_KIND]: {
    icon: "i-material-symbols:language",
    name: "リレーセット",
    count: (set) => `リレー ${set.relays.length} 個`,
    body: (set) => (
      <Show when={set.relays.length > 0}>
        <RelayList relays={set.relays} />
      </Show>
    ),
    compactBody: (set) => (
      <Show when={set.relays.length > 0}>
        <RelayNames relays={set.relays} />
      </Show>
    ),
  },
  [BOOKMARK_SET_KIND]: {
    icon: "i-material-symbols:bookmarks-outline-rounded",
    name: "ブックマーク",
    count: eventCount,
    body: (set) => <FirstEvent set={set} />,
  },
  [CURATION_SET_KIND]: {
    icon: "i-material-symbols:collections-bookmark-outline-rounded",
    name: "まとめ",
    count: eventCount,
    body: (set) => <FirstEvent set={set} />,
  },
  [VIDEO_SET_KIND]: {
    icon: "i-material-symbols:video-library-outline-rounded",
    name: "動画のまとめ",
    count: eventCount,
    body: (set) => <FirstEvent set={set} />,
  },
  [PICTURE_SET_KIND]: {
    icon: "i-material-symbols:photo-library-outline-rounded",
    name: "画像のまとめ",
    count: eventCount,
    body: (set) => <FirstEvent set={set} />,
  },
  [INTEREST_SET_KIND]: {
    icon: "i-material-symbols:tag-rounded",
    name: "好きな話題",
    count: (set) => `話題 ${set.hashtags.length} 個`,
  },
  [STARTER_PACK_KIND]: {
    icon: "i-material-symbols:group-add-outline-rounded",
    name: "スターターパック",
    count: people,
    body: (set) => (
      <Show when={set.pubkeys.length > 0}>
        <Faces pubkeys={set.pubkeys} />
      </Show>
    ),
  },
  [MEDIA_STARTER_PACK_KIND]: {
    icon: "i-material-symbols:group-add-outline-rounded",
    name: "スターターパック",
    count: people,
    body: (set) => (
      <Show when={set.pubkeys.length > 0}>
        <Faces pubkeys={set.pubkeys} />
      </Show>
    ),
  },
};

const isListSetKind = (kind: number): kind is ListSetKind => kind in LIST_KINDS;

/** NIP-51 のリスト（フォローセット・絵文字セット以外）とスターターパック。 */
const ListSetCard: Component<CardProps> = (props) => {
  const set = () => readListSet(props.event);
  const kind = () =>
    isListSetKind(props.event.kind) ? LIST_KINDS[props.event.kind] : undefined;
  return (
    <ListRow
      event={props.event}
      size={props.size}
      title={set().title ?? (set().identifier || kind()?.name || "リスト")}
      image={set().image}
      icon={kind()?.icon}
      count={kind()?.count(set())}
      description={set().description}
    >
      {props.size === "normal"
        ? kind()?.body?.(set())
        : kind()?.compactBody?.(set())}
    </ListRow>
  );
};

export default ListSetCard;
