import { buildChannelColumn } from "@streets/core/deck/column-presets";
import {
  allChannelsSource,
  channelsSource,
  recentChannelMessagesSource,
} from "@streets/core/deck/column-sources";
import { activeChannels } from "@streets/core/nostr/channel";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type ChannelEntry,
  channelDirectory,
  channelsFrom,
  searchChannels,
} from "@streets/core/view/channel-directory";
import { channelReadRelays } from "@streets/core/view/chat";
import { type Component, createMemo, createSignal } from "solid-js";
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

  const [searching, setSearching] = createSignal(false);
  const [query, setQuery] = createSignal("");
  // 一度探したら持ち続ける。探す表示を閉じても購読は閉じない。
  const [browsed, setBrowsed] = createSignal(false);
  const all = createBlockSection({
    source: () => (browsed() ? allChannelsSource(relays()) : undefined),
    name: "all",
    maxItems: Number.POSITIVE_INFINITY,
  });

  const channels = createMemo(() =>
    channelsFrom([...info.items(), ...all.items()]),
  );
  const directory = createMemo(() =>
    channelDirectory({
      channels: channels(),
      favorites: favorites(),
      active: active(),
    }),
  );
  const results = createMemo(() =>
    searching()
      ? searchChannels({
          channels: channels(),
          favorites: favorites(),
          active: active(),
          query: query(),
        })
      : [],
  );

  const open = (entry: ChannelEntry) =>
    dispatch({
      type: "stack/open",
      column: buildChannelColumn(
        entry.channel.id,
        entry.channel.metadata.name,
        entry.channel.metadata.relays.length > 0
          ? entry.channel.metadata.relays
          : relays(),
      ),
    });

  return (
    <ChannelListView
      searching={searching()}
      query={query()}
      favorites={directory().favorites}
      active={directory().active}
      results={results()}
      favoritesSettled={
        favorites().length === 0 || info.status().phase === "settled"
      }
      activeSettled={recent.status().phase === "settled"}
      allSettled={all.status().phase === "settled"}
      onSearch={(next) => {
        setSearching(next);
        if (next) setBrowsed(true);
        else setQuery("");
      }}
      onQuery={setQuery}
      onOpen={open}
    />
  );
};

export default ChannelList;
