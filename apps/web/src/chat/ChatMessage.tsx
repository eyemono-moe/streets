import { Menu } from "@ark-ui/solid/menu";
import {
  CHANNEL_MESSAGE_KIND,
  channelReplyTarget,
} from "@streets/core/nostr/channel";
import type { MessageVisibility } from "@streets/core/nostr/channel";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeNevent } from "@streets/core/nostr/nip19";
import { profileLabel } from "@streets/core/nostr/profile";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { formatEventTimeFull } from "@streets/core/view/format-time";
import { type Component, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useEventActions } from "../actions";
import { defaultReaction } from "../default-reaction-setting";
import ReactionPicker from "../emoji/ReactionPicker";
import { lazyPart } from "../lazy-part";
import AuthorNames from "../note/AuthorNames";
import Avatar from "../note/Avatar";
import { NoteContent } from "../note/Event";
import ReactionList from "../note/ReactionList";
import { useEvent } from "../note/use-event";
import { useProfile } from "../note/use-profile";
import { notifyError } from "../toast";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";

/** 日付は区切りの行が出すので、発言には時刻だけを出す。 */
const chatTime = (date: Date): string =>
  date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

const EventDetailsDialog = lazyPart(() => import("../note/EventDetailsDialog"));

/** 返信先を 1 行で出す。取りに行っている間は名前だけ、読めなければ出さない。 */
const ReplyContext: Component<{
  id: string;
  relay?: RelayUrl;
  pubkey?: string;
}> = (props) => {
  const lookup = useEvent(() => ({ id: props.id, relay: props.relay }));
  const parent = () => {
    const current = lookup();
    return current.phase === "found" ? current.event : undefined;
  };
  const author = () => parent()?.pubkey ?? props.pubkey;
  const profile = useProfile(author);
  return (
    <Show when={author()}>
      {(pubkey) => (
        <p class="c-secondary flex min-w-0 items-center gap-1 text-caption">
          <span
            class="i-material-symbols:reply-rounded size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span class="sr-only">返信先</span>
          <span class="shrink-0 font-600">
            {profileLabel(profile(), pubkey())}
          </span>
          <Show when={parent()}>
            {(event) => (
              // 1 行だけ出す。本文の改行や画像をそのまま描くと、返信の行が崩れる。
              <span class="min-w-0 truncate">
                {event().content.replace(/\s+/g, " ").trim()}
              </span>
            )}
          </Show>
        </p>
      )}
    </Show>
  );
};

/**
 * チャンネルでの 1 つの発言。カーソルを当てると右上に操作を出す（返信・いいね・
 * リアクション・⋯）。⋯ のメニューにも返信とリアクションを入れる —— 触って
 * 操作する画面ではカーソルを当てられない。
 */
export const ChatMessage: Component<{
  event: NostrEvent;
  continued: boolean;
  relays: readonly RelayUrl[];
  expandMedia: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const viewer = useEventActions()?.viewer;
  const mine = () => props.event.pubkey === viewer;
  const [picking, setPicking] = createSignal(false);
  const [details, setDetails] = createSignal(false);
  const replyTo = () => channelReplyTarget(props.event);
  const date = () => new Date(props.event.created_at * 1000);
  const reply = () => dispatch({ type: "chat/reply", target: props.event.id });
  const copyLink = async () => {
    const nevent = encodeNevent({
      id: props.event.id,
      relays: props.relays.slice(0, 2),
      author: props.event.pubkey,
      eventKind: CHANNEL_MESSAGE_KIND,
    });
    try {
      await navigator.clipboard.writeText(`nostr:${nevent}`);
    } catch (cause) {
      notifyError(cause, "リンクをコピーできませんでした");
    }
  };

  return (
    <article
      class="group relative flex gap-2.5 px-3 hover:bg-alpha-hover focus-within:bg-alpha-hover"
      classList={{ "pt-2.5 pb-1": !props.continued, "py-0.5": props.continued }}
    >
      <div class="w-8 shrink-0">
        <Show when={!props.continued}>
          <Avatar pubkey={props.event.pubkey} size="compact" />
        </Show>
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <Show when={!props.continued}>
          <div class="flex min-w-0 items-baseline gap-1.5">
            {/* 名前が長いときは名前の側を詰める。詰めないとカラムが横にはみ出す。 */}
            <div class="min-w-0 shrink">
              <AuthorNames pubkey={props.event.pubkey} size="compact" />
            </div>
            <time
              class="c-secondary shrink-0 text-caption"
              datetime={date().toISOString()}
              title={formatEventTimeFull(date())}
            >
              {chatTime(date())}
            </time>
          </div>
        </Show>
        <Show when={replyTo()}>
          {(ref) => (
            <ReplyContext
              id={ref().id}
              relay={ref().relay}
              pubkey={ref().pubkey}
            />
          )}
        </Show>
        <NoteContent
          event={props.event}
          size="normal"
          expandMedia={props.expandMedia}
        />
        <ReactionList event={props.event} />
      </div>

      <div
        class="-top-3.5 absolute right-2 hidden items-center gap-0.5 rounded-2 border border-primary bg-primary p-0.5 shadow-sm group-hover:flex group-focus-within:flex has-[[data-state=open]]:flex"
        role="toolbar"
        aria-label="この発言の操作"
      >
        <Button
          variant="ghost"
          size="sm"
          shape="rounded"
          icon="i-material-symbols:reply-rounded"
          aria-label="返信する"
          onClick={reply}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="rounded"
          icon="i-material-symbols:favorite-outline-rounded"
          aria-label="いいね"
          onClick={() =>
            dispatch({
              type: "note/react",
              target: props.event,
              input: defaultReaction(),
            })
          }
        />
        <ReactionPicker
          target={props.event}
          open={picking()}
          onOpenChange={setPicking}
          trigger={(trigger) => (
            <Button
              variant="ghost"
              size="sm"
              shape="rounded"
              icon="i-material-symbols:add-reaction-outline-rounded"
              aria-label="リアクションする"
              {...trigger()}
            />
          )}
        />
        <Menu.Root
          lazyMount
          unmountOnExit
          onSelect={(details) => {
            if (details.value === "reply") reply();
            if (details.value === "react") setPicking(true);
            if (details.value === "copy-link") void copyLink();
            if (details.value === "details") setDetails(true);
            if (
              details.value === "mute-message" ||
              details.value === "mute-user"
            ) {
              dispatch({
                type: "chat-mute/open",
                kind: details.value === "mute-message" ? "message" : "user",
                messageId: props.event.id,
                pubkey: props.event.pubkey,
              });
            }
          }}
        >
          <Menu.Trigger
            asChild={(trigger) => (
              <Button
                variant="ghost"
                size="sm"
                shape="rounded"
                icon="i-material-symbols:more-horiz"
                aria-label="そのほかの操作"
                {...trigger()}
              />
            )}
          />
          <Portal>
            <Menu.Positioner>
              <Menu.Content class="motion-pop c-primary w-70 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
                <MenuItem
                  value="reply"
                  icon="i-material-symbols:reply-rounded"
                  label="返信する"
                />
                <MenuItem
                  value="react"
                  icon="i-material-symbols:add-reaction-outline-rounded"
                  label="リアクションする"
                />
                <MenuItem
                  value="copy-link"
                  icon="i-material-symbols:link-rounded"
                  label="リンクをコピー"
                />
                <MenuItem
                  value="details"
                  icon="i-material-symbols:code-rounded"
                  label="発言の詳細"
                />
                {/* 自分の発言はミュートしても自分には畳まれないので、出さない。 */}
                <Show when={!mine()}>
                  <Menu.Separator class="my-1 border-primary border-t" />
                  <MenuItem
                    value="mute-message"
                    icon="i-material-symbols:visibility-off-outline-rounded"
                    label="このメッセージをミュートする"
                  />
                  <MenuItem
                    value="mute-user"
                    icon="i-material-symbols:person-off-outline-rounded"
                    label="このユーザーをミュートする"
                  />
                </Show>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </div>
      <Show when={details()}>
        <EventDetailsDialog
          event={props.event}
          onClose={() => setDetails(false)}
        />
      </Show>
    </article>
  );
};

const MenuItem: Component<{ value: string; icon: string; label: string }> = (
  props,
) => (
  <Menu.Item
    value={props.value}
    class="flex cursor-pointer items-center gap-2.5 rounded-1.5 px-2.5 py-1.5 text-body data-[highlighted]:bg-secondary"
  >
    <span
      class={`c-secondary size-4.5 shrink-0 ${props.icon}`}
      aria-hidden="true"
    />
    {props.label}
  </Menu.Item>
);

const HIDDEN_LABEL: Record<Exclude<MessageVisibility, "visible">, string> = {
  "muted-by-others": "ほかの人がミュートしたメッセージです",
  "muted-by-me": "ミュートしたメッセージです",
  "muted-user": "ミュートした人の発言です",
};

/** ミュートされた発言。消さずに畳み、押せば読める。 */
export const HiddenChatMessage: Component<{
  event: NostrEvent;
  visibility: Exclude<MessageVisibility, "visible">;
  relays: readonly RelayUrl[];
  expandMedia: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(false);
  return (
    <Show
      when={open()}
      fallback={
        <div class="py-1 pr-3 pl-13.5">
          <div class="c-secondary flex items-center gap-2 rounded-2 bg-secondary px-2.5 py-2 text-caption">
            <span
              class="i-material-symbols:visibility-off-outline-rounded size-4 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">{HIDDEN_LABEL[props.visibility]}</span>
            <button
              type="button"
              class="c-accent-5 shrink-0 cursor-pointer bg-transparent font-600"
              onClick={() => setOpen(true)}
            >
              表示する
            </button>
          </div>
        </div>
      }
    >
      <div class="flex flex-col">
        <ChatMessage
          event={props.event}
          continued={false}
          relays={props.relays}
          expandMedia={props.expandMedia}
        />
        <button
          type="button"
          class="c-secondary cursor-pointer self-start bg-transparent pb-1 pl-13.5 text-caption hover:underline"
          onClick={() => setOpen(false)}
        >
          畳む
        </button>
      </div>
    </Show>
  );
};
