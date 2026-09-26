import {
  channelMessagesSource,
  channelSource,
  chatModerationSource,
} from "@streets/core/deck/column-sources";
import {
  CHANNEL_CREATE_KIND,
  CHANNEL_METADATA_KIND,
  channelFrom,
  chatModeration,
} from "@streets/core/nostr/channel";
import { PAGE_SIZE } from "@streets/core/read/source";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import {
  type ChatReplyEvent,
  channelReadRelays,
  chatReplyTransition,
  chatRows,
  emptyChatReply,
} from "@streets/core/view/chat";
import {
  type ChatMuteEvent,
  type ChatMuteState,
  chatMuteTransition,
  closedChatMute,
} from "@streets/core/view/chat-mute";
import { type Component, Show, createMemo } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { useEventActions } from "../../actions";
import ChatComposer from "../../chat/ChatComposer";
import ChatMuteDialog from "../../chat/ChatMuteDialog";
import ChatView from "../../chat/ChatView";
import { onceTrue } from "../../lazy-part";
import { ComposeMediator } from "../../note/ComposeMediator";
import { useReadLayer } from "../../read-layer";
import { useMutes } from "../../settings/MuteMediator";
import { notifyError } from "../../toast";
import { Mediates, type UiEvent } from "../../ui-events";
import { createBlockSection, useColumnScope } from "../column-scope";

/**
 * NIP-28 のチャンネル 1 つ。チャンネルの情報・発言・チャット内のミュートを、
 * チャンネルのリレーから読む。返信先を選ぶ段と、送る段（`ComposeMediator`）を持つ。
 */
const ChannelChat: Component<{
  channelId: string;
  /** 開いたときに分かっていたリレー（nevent のヒントなど）。 */
  hints: readonly RelayUrl[];
  /** 何も分からないときに探す、自分の読み込みリレー。 */
  viewerRead: () => readonly RelayUrl[];
  viewer: string;
}> = (props) => {
  const scope = useColumnScope();
  const { store } = useReadLayer();
  const actions = useEventActions();
  const mutes = useMutes();

  // チャンネルの情報を探すリレーは、まだ情報が無いのでヒントか自分のリレー。
  const lookupRelays = () =>
    channelReadRelays({
      metadata: [],
      hints: props.hints,
      viewerRead: props.viewerRead(),
    });
  const info = createBlockSection({
    source: () => channelSource(props.channelId, lookupRelays()),
    name: "info",
  });
  const channel = createMemo(() => {
    const items = info.items();
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
  const relays = createMemo(
    () =>
      channelReadRelays({
        metadata: channel()?.metadata.relays ?? [],
        hints: props.hints,
        viewerRead: props.viewerRead(),
      }),
    undefined,
    { equals: (a, b) => a.join() === b.join() },
  );

  const messages = createBlockSection({
    source: () => channelMessagesSource(props.channelId, relays()),
    pageSize: PAGE_SIZE,
    name: "messages",
  });
  const moderation = createBlockSection({
    source: () => chatModerationSource(relays()),
    name: "moderation",
  });

  const rows = createMemo(() => {
    const received = messages.items();
    const visible = mutes
      ? received.filter((event) => !mutes.hides(event))
      : received;
    return chatRows(visible, chatModeration(moderation.items()), props.viewer);
  });

  const [reply, setReply] = createStore(emptyChatReply());
  const applyReply = (event: ChatReplyEvent) =>
    setReply(reconcile(chatReplyTransition(unwrap(reply), event)));
  const replyTarget = () =>
    reply.replyTo ? store.get(reply.replyTo) : undefined;
  const [mute, setMute] = createStore<{ state: ChatMuteState }>({
    state: closedChatMute(),
  });
  const applyMute = (event: ChatMuteEvent) => {
    const next = chatMuteTransition(unwrap(mute).state, event);
    setMute("state", reconcile(next));
    return next;
  };
  const sendMute = (state: Exclude<ChatMuteState, { phase: "closed" }>) => {
    if (!actions) return;
    actions
      .muteInChat(
        state.kind,
        { messageId: state.messageId, pubkey: state.pubkey },
        state.reason,
        relays(),
      )
      .then(
        () => applyMute({ type: "chat-mute/sent" }),
        (cause) => {
          applyMute({ type: "chat-mute/failed" });
          notifyError(cause, "ミュートできませんでした");
        },
      );
  };

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "chat/reply":
      case "chat/cancel-reply":
        applyReply(event);
        return true;
      case "chat-mute/submit": {
        const next = applyMute(event);
        if (next.phase === "sending") sendMute(next);
        return true;
      }
      case "chat-mute/open":
      case "chat-mute/reason":
      case "chat-mute/close":
        applyMute(event);
        return true;
      default:
        return false;
    }
  };

  // 閉じる動きを見せるため、一度開いたら残す。
  const muteMounted = onceTrue(() => mute.state.phase !== "closed");

  const name = () => channel()?.metadata.name ?? scope.column().title;

  return (
    <Mediates handle={handle}>
      <ComposeMediator
        failure="チャンネルに書けませんでした"
        send={async (text, media, emoji) => {
          if (!actions) throw new Error("ログインしていません");
          await actions.channelMessage(
            { id: props.channelId, relays: relays() },
            text,
            { replyTo: replyTarget(), media, emoji },
          );
        }}
        onSent={() => applyReply({ type: "compose/sent" })}
      >
        {(state) => (
          <ChatView
            rows={rows()}
            relays={relays()}
            expandMedia={scope.column().expandMedia !== false}
            paging={messages.paging()}
            settled={messages.status().phase === "settled"}
            onLoadOlder={messages.loadMore}
            composer={
              <ChatComposer
                state={state}
                channelName={name()}
                replyTo={replyTarget()}
              />
            }
          />
        )}
      </ComposeMediator>
      <Show when={muteMounted()}>
        <ChatMuteDialog
          state={mute.state}
          target={
            mute.state.phase === "closed"
              ? undefined
              : store.get(mute.state.messageId)
          }
        />
      </Show>
    </Mediates>
  );
};

export default ChannelChat;
