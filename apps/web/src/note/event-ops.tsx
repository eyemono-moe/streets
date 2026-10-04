import { buildActivityColumn } from "@streets/core/deck/column-presets";
import { threadMuteTarget } from "@streets/core/moderation/mute-list";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import { encodeEventPointer } from "@streets/core/nostr/event-pointer";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import type { EventActionId } from "@streets/core/settings/action-layout";
import { reactionContentOf } from "@streets/core/settings/default-reaction";
import { eventEngagements } from "@streets/core/view/event-engagements";
import { type JSX, Match, Switch, createMemo, createSignal } from "solid-js";
import { defaultReaction } from "../default-reaction-setting";
import { lazyPart } from "../lazy-part";
import { useLoginGate } from "../login-gate";
import { useReadLayer } from "../read-layer";
import { useMutes } from "../settings/MuteMediator";
import { notifyError, notifySuccess } from "../toast";
import { useDispatch } from "../ui-events";
import TargetComposeDialog from "./TargetComposeDialog";
import { useEngagementChanges } from "./use-engagement-changes";

const EventDetailsDialog = lazyPart(() => import("./EventDetailsDialog"));

const BroadcastDialog = lazyPart(() => import("./BroadcastDialog"));

/** 設定の画面で、操作を見分けるための名前とアイコン。 */
export const EVENT_ACTION_META: Record<
  EventActionId,
  { label: string; icon: string }
> = {
  reply: {
    label: "返信",
    icon: "i-material-symbols:mode-comment-outline-rounded",
  },
  repost: {
    label: "リポスト・引用",
    icon: "i-material-symbols:repeat-rounded",
  },
  like: {
    label: "いいね",
    icon: "i-material-symbols:favorite-outline-rounded",
  },
  react: {
    label: "絵文字でリアクション",
    icon: "i-material-symbols:add-reaction-outline-rounded",
  },
  zap: { label: "Zap", icon: "i-material-symbols:bolt-outline-rounded" },
  bookmark: {
    label: "ブックマーク",
    icon: "i-material-symbols:bookmark-outline-rounded",
  },
  pin: {
    label: "プロフィールにピン留め",
    icon: "i-material-symbols:keep-outline-rounded",
  },
  activity: {
    label: "アクティビティを見る",
    icon: "i-material-symbols:monitoring-rounded",
  },
  "copy-link": {
    label: "リンクをコピー",
    icon: "i-material-symbols:link-rounded",
  },
  details: {
    label: "詳細（JSON・リレー）",
    icon: "i-material-symbols:code-rounded",
  },
  "mute-event": {
    label: "このイベントをミュート",
    icon: "i-material-symbols:volume-off-outline-rounded",
  },
  broadcast: {
    label: "ほかのリレーにも送る",
    icon: "i-material-symbols:cell-tower-rounded",
  },
};

/** 反応の数と、自分が済ませたか。反応が届くたびに数え直す。 */
export const useEngagements = (event: () => NostrEvent, viewer: string) => {
  const { store } = useReadLayer();
  const changed = useEngagementChanges(() => event().id);
  return createMemo(() => {
    changed();
    return eventEngagements(
      store,
      event().id,
      viewer,
      reactionContentOf(defaultReaction()),
    );
  });
};

export const reactionLabel = (input: ReactionInput): string =>
  input.type === "like"
    ? "いいね"
    : `${input.type === "text" ? input.content : `:${input.shortcode}:`} でリアクション`;

/**
 * 投稿の中身によらない操作。アクション欄にもメニューにも置けるので、ここにまとめる。
 * 呼んだ時点では何も読まない（投稿の数だけ呼ばれる）。
 */
export const useEventLevelOps = (event: () => NostrEvent) => {
  const dispatch = useDispatch();
  const { store } = useReadLayer();
  const mutes = useMutes();
  const target = () => threadMuteTarget(event());
  // スレッドやその人のページでは、ミュートした投稿も出ているので、そこから解除できる。
  const muteEntry = () =>
    mutes
      ?.entries()
      .find(
        (entry) =>
          entry.target.type === target().type &&
          entry.target.value === target().value,
      );
  return {
    /** ミュートの一覧を読めていない間は、押せない見た目にする。 */
    canMute: mutes !== undefined,
    muted: () => muteEntry() !== undefined,
    toggleMute: () => {
      const entry = muteEntry();
      dispatch(
        entry
          ? { type: "mutes/remove", entry }
          : { type: "mutes/add", target: target() },
      );
    },
    activity: () =>
      dispatch({
        type: "stack/open",
        column: buildActivityColumn(event().id),
        from: event().id,
      }),
    copyLink: async () => {
      const uri = `nostr:${encodeEventPointer(
        event(),
        relaysSeenOn(store, event().id),
      )}`;
      try {
        await navigator.clipboard.writeText(uri);
        notifySuccess("リンクをコピーしました");
      } catch (cause) {
        // 非セキュアな接続や権限拒否で失敗する。黙って何も起きないと壊れて見える。
        notifyError(cause, "リンクをコピーできませんでした");
      }
    },
  };
};

/** ミュートの状態で変わる、ミュートの操作の名前とアイコン。 */
export const muteEventLook = (muted: boolean) =>
  muted
    ? {
        label: "このイベントのミュートを解除",
        icon: "i-material-symbols:volume-up-outline-rounded",
      }
    : EVENT_ACTION_META["mute-event"];

/** NIP-51 のピン留めは kind:1 の投稿を入れるリスト。ほかの kind は入れない。 */
export const canPin = (event: NostrEvent): boolean => event.kind === 1;

export const pinLook = (event: NostrEvent, pinned: boolean) =>
  pinned
    ? { label: "ピン留めを外す", icon: "i-material-symbols:keep-rounded" }
    : canPin(event)
      ? EVENT_ACTION_META.pin
      : {
          label: "この投稿はピン留めできません",
          icon: EVENT_ACTION_META.pin.icon,
        };

type EventDialog = "reply" | "quote" | "details" | "broadcast";

/**
 * 操作から開くダイアログ。アクション欄とメニューのどちらからも開くので、
 * 置き場所ごとに持つ。`view` は置いた場所に描く（中身は body の末尾へ出る）。
 */
export const createEventDialogs = (event: () => NostrEvent) => {
  const gate = useLoginGate();
  const [open, setOpen] = createSignal<EventDialog>();
  // 書く操作は、書き始める前にログインを確かめる。詳細を見るだけなら要らない。
  const NEEDS_ACCOUNT: Partial<Record<EventDialog, string>> = {
    reply: "返信",
    quote: "引用",
    broadcast: "ほかのリレーへの送り直し",
  };
  const openDialog = (dialog: EventDialog | undefined) => {
    const what = dialog && NEEDS_ACCOUNT[dialog];
    if (what && !gate(what)) return;
    setOpen(dialog);
  };
  const close = () => setOpen(undefined);
  const view: JSX.Element = (
    <Switch>
      <Match when={open() === "reply" || open() === "quote"}>
        <TargetComposeDialog
          target={{
            type: open() === "quote" ? "quote" : "reply",
            event: event(),
          }}
          onClose={close}
        />
      </Match>
      <Match when={open() === "details"}>
        <EventDetailsDialog event={event()} onClose={close} />
      </Match>
      <Match when={open() === "broadcast"}>
        <BroadcastDialog event={event()} onClose={close} />
      </Match>
    </Switch>
  );
  return { open: openDialog, view };
};
