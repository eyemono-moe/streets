import { channelSource } from "@streets/core/deck/column-sources";
import {
  CHANNEL_CREATE_KIND,
  CHANNEL_METADATA_KIND,
  channelFrom,
} from "@streets/core/nostr/channel";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { channelReadRelays } from "@streets/core/view/chat";
import { type Component, createMemo } from "solid-js";
import { useEventActions } from "../../actions";
import ChannelInfoView from "../../chat/ChannelInfoView";
import { createBlockSection } from "../column-scope";

/** チャンネルの情報を読む。書き換え（kind:41）も待ち受け、直したらその場で変わる。 */
const ChannelInfo: Component<{
  channelId: string;
  hints: readonly RelayUrl[];
  viewerRead: () => readonly RelayUrl[];
}> = (props) => {
  const actions = useEventActions();
  const section = createBlockSection({
    source: () =>
      channelSource(
        props.channelId,
        channelReadRelays({
          metadata: [],
          hints: props.hints,
          viewerRead: props.viewerRead(),
        }),
      ),
    name: "info",
  });
  const channel = createMemo(() => {
    const items = section.items();
    const create = items.find(
      (event) =>
        event.kind === CHANNEL_CREATE_KIND && event.id === props.channelId,
    );
    return create
      ? channelFrom(
          create,
          items.filter((event) => event.kind === CHANNEL_METADATA_KIND),
        )
      : undefined;
  });
  return (
    <ChannelInfoView
      channel={channel()}
      settled={section.status().phase === "settled"}
      signedIn={actions !== undefined}
      favorite={
        actions?.favoriteChannelIds().includes(props.channelId) ?? false
      }
      editable={actions !== undefined && channel()?.creator === actions.viewer}
    />
  );
};

export default ChannelInfo;
