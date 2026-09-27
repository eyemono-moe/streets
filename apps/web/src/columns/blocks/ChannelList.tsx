import { buildChannelColumn } from "@streets/core/deck/column-presets";
import {
  allChannelsSource,
  channelsSource,
  recentChannelMessagesSource,
} from "@streets/core/deck/column-sources";
import type { ColumnDef } from "@streets/core/deck/deck";
import { activeChannels } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type ChannelEntry,
  channelDirectory,
  channelsFrom,
  searchChannels,
} from "@streets/core/view/channel-directory";
import { channelReadRelays } from "@streets/core/view/chat";
import {
  type Component,
  createComputed,
  createMemo,
  createSignal,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useEventActions } from "../../actions";
import ChannelListView from "../../chat/ChannelListView";
import { useDispatch } from "../../ui-events";
import { createBlockSection } from "../column-scope";

/** 最近アクティブとみなす期間。 */
const ACTIVE_WITHIN = 7 * 24 * 60 * 60;

/**
 * チャンネルの一覧。リレーへの負荷を抑えるため、
 * - 最近アクティブなチャンネルは、直近の発言を上限付きで 1 本取るだけにする
 * - すべてのチャンネルは、探す表示に初めて入ったときに上限付きで取り、カラムを
 *   開いている間は持ち続ける（出入りするたびに取り直さない）
 * - 探す文字での絞り込みは手元で行い、打つたびに問い合わせない
 * - 読むリレーは自分の読み込みリレーから 3 本まで
 */
const ChannelList: Component<{
  viewerRead: () => readonly RelayUrl[];
  /** 押したときにすること。渡さなければ、そのカラムの中に重ねて開く。 */
  onOpen?: (column: ColumnDef) => void;
}> = (props) => {
  const dispatch = useDispatch();
  const actions = useEventActions();
  const relays = createMemo(
    () =>
      channelReadRelays({
        metadata: [],
        hints: [],
        viewerRead: props.viewerRead(),
        max: 3,
      }),
    undefined,
    { equals: (a, b) => a.join() === b.join() },
  );
  // 期間の起点は開いたときに一度決める。読むたびに変えると購読を張り直す。
  const since = Math.floor(Date.now() / 1000) - ACTIVE_WITHIN;

  const recent = createBlockSection({
    source: () => recentChannelMessagesSource(relays(), since),
    name: "recent",
  });
  const active = createMemo(() => activeChannels(recent.items()));
  const favorites = () => actions?.favoriteChannelIds() ?? [];

  const knownIds = createMemo(
    () =>
      [...new Set([...favorites(), ...active().map((item) => item.id)])].sort(),
    undefined,
    { equals: (a, b) => a.join() === b.join() },
  );
  const info = createBlockSection({
    source: () => channelsSource(knownIds(), relays()),
    name: "info",
    maxItems: Number.POSITIVE_INFINITY,
  });

  const [query, setQuery] = createSignal("");
  // 「すべて」を一度開いたら持ち続ける。タブを戻しても購読は閉じない。
  const [browsed, setBrowsed] = createSignal(false);
  const all = createBlockSection({
    source: () => (browsed() ? allChannelsSource(relays()) : undefined),
    name: "all",
    maxItems: Number.POSITIVE_INFINITY,
  });

  // 届いたチャンネルの情報は、購読を張り直しても手元に残す。知っている id が増える
  // たびに情報の購読を張り直すので、そのまま使うと張り直した直後に一覧が空になる。
  const received = new Map<string, NostrEvent>();
  const channels = createMemo(() => {
    for (const event of [...info.items(), ...all.items()]) {
      received.set(event.id, event);
    }
    return channelsFrom([...received.values()]);
  });
  const directory = createMemo(() =>
    channelDirectory({
      channels: channels(),
      favorites: favorites(),
      active: active(),
    }),
  );
  const results = createMemo(() =>
    browsed()
      ? searchChannels({
          channels: channels(),
          favorites: favorites(),
          active: active(),
          query: query(),
        })
      : [],
  );

  // 行はチャンネルの id で突き合わせて当てる。作り直した配列をそのまま渡すと、発言が
  // 1 件届くたびに <For> が全行を作り直し、チャンネルの画像がちらつく。
  type Keyed = ChannelEntry & { id: string };
  const keyed = (entries: readonly ChannelEntry[]): Keyed[] =>
    entries.map((entry) => ({ ...entry, id: entry.channel.id }));
  const [lists, setLists] = createStore<{
    favorites: Keyed[];
    active: Keyed[];
    results: Keyed[];
  }>({ favorites: [], active: [], results: [] });
  createComputed(() =>
    setLists("favorites", reconcile(keyed(directory().favorites))),
  );
  createComputed(() =>
    setLists("active", reconcile(keyed(directory().active))),
  );
  createComputed(() => setLists("results", reconcile(keyed(results()))));

  const relaysOf = (entry: ChannelEntry) =>
    entry.channel.metadata.relays.length > 0
      ? entry.channel.metadata.relays
      : relays();
  const open = (entry: ChannelEntry) => {
    const column = buildChannelColumn(
      entry.channel.id,
      entry.channel.metadata.name,
      relaysOf(entry),
    );
    if (props.onOpen) props.onOpen(column);
    else dispatch({ type: "stack/open", column });
  };

  return (
    <ChannelListView
      query={query()}
      favorites={lists.favorites}
      active={lists.active}
      results={lists.results}
      favoritesSettled={
        favorites().length === 0 || info.status().phase === "settled"
      }
      activeSettled={recent.status().phase === "settled"}
      allSettled={all.status().phase === "settled"}
      onQuery={setQuery}
      onBrowse={() => setBrowsed(true)}
      onOpen={open}
      onCreate={
        actions
          ? () =>
              dispatch({ type: "channel-form/open-create", relays: relays() })
          : undefined
      }
    />
  );
};

export default ChannelList;
