import {
  buildActivityColumn,
  buildTimeslipColumn,
} from "@streets/core/deck/column-presets";
import { threadMuteTarget } from "@streets/core/moderation/mute-list";
import type { NostrEvent } from "@streets/core/nostr/event";
import { canBookmark, canPin } from "@streets/core/nostr/event-actions";
import { encodeEventPointer } from "@streets/core/nostr/event-pointer";
import type { ReactionInput } from "@streets/core/nostr/reaction";
import { relaysSeenOn } from "@streets/core/read/seen-relays";
import type { EventActionId } from "@streets/core/settings/action-layout";
import { reactionContentOf } from "@streets/core/settings/default-reaction";
import { eventEngagements } from "@streets/core/view/event-engagements";
import { type JSX, Match, Switch, createMemo, createSignal } from "solid-js";
import { useAppWindow } from "../app-window";
import { defaultReaction } from "../default-reaction-setting";
import { t } from "../i18n/locale";
import { lazyPart } from "../lazy-part";
import { useLoginGate } from "../login-gate";
import { useAppletIntents } from "../napplet/applet-intents";
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
    get label() {
      return t("note.eventActions.reply");
    },
    icon: "i-material-symbols:mode-comment-outline-rounded",
  },
  repost: {
    get label() {
      return t("note.eventActions.repost");
    },
    icon: "i-material-symbols:repeat-rounded",
  },
  like: {
    get label() {
      return t("note.eventActions.like");
    },
    icon: "i-material-symbols:favorite-outline-rounded",
  },
  react: {
    get label() {
      return t("note.eventActions.react");
    },
    icon: "i-material-symbols:add-reaction-outline-rounded",
  },
  zap: {
    get label() {
      return t("note.eventActions.zap");
    },
    icon: "i-material-symbols:bolt-outline-rounded",
  },
  bookmark: {
    get label() {
      return t("note.eventActions.bookmark");
    },
    icon: "i-material-symbols:bookmark-outline-rounded",
  },
  pin: {
    get label() {
      return t("note.eventActions.pin");
    },
    icon: "i-material-symbols:keep-outline-rounded",
  },
  activity: {
    get label() {
      return t("note.eventActions.activity");
    },
    icon: "i-material-symbols:monitoring-rounded",
  },
  timeslip: {
    get label() {
      return t("note.eventActions.timeslip");
    },
    icon: "i-material-symbols:history-rounded",
  },
  "copy-link": {
    get label() {
      return t("note.eventActions.copyLink");
    },
    icon: "i-material-symbols:link-rounded",
  },
  details: {
    get label() {
      return t("note.eventActions.details");
    },
    icon: "i-material-symbols:code-rounded",
  },
  "mute-event": {
    get label() {
      return t("note.eventActions.muteEvent");
    },
    icon: "i-material-symbols:volume-off-outline-rounded",
  },
  broadcast: {
    get label() {
      return t("note.eventActions.broadcast");
    },
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
    ? t("note.eventActions.like")
    : t("note.eventActions.reactWith", {
        emoji: input.type === "text" ? input.content : `:${input.shortcode}:`,
      });

/**
 * 投稿の中身によらない操作。アクション欄にもメニューにも置けるので、ここにまとめる。
 * 呼んだ時点では何も読まない（投稿の数だけ呼ばれる）。
 */
export const useEventLevelOps = (event: () => NostrEvent) => {
  const appWindow = useAppWindow();
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
    /** この投稿の日時から、フォロー中の人の投稿をさかのぼるカラムをデッキに足す。 */
    timeslip: () =>
      dispatch({
        type: "deck/add-column",
        column: buildTimeslipColumn(event().created_at),
      }),
    copyLink: async () => {
      const uri = `nostr:${encodeEventPointer(
        event(),
        relaysSeenOn(store, event().id),
      )}`;
      try {
        await appWindow.navigator.clipboard.writeText(uri);
        notifySuccess(t("note.eventActions.linkCopied"));
      } catch (cause) {
        // 非セキュアな接続や権限拒否で失敗する。黙って何も起きないと壊れて見える。
        notifyError(cause, t("note.eventActions.linkCopyFailed"));
      }
    },
  };
};

/** ミュートの状態で変わる、ミュートの操作の名前とアイコン。 */
export const muteEventLook = (muted: boolean) =>
  muted
    ? {
        get label() {
          return t("note.eventActions.unmuteEvent");
        },
        icon: "i-material-symbols:volume-up-outline-rounded",
      }
    : EVENT_ACTION_META["mute-event"];

/** ブックマークの操作の名前とアイコン。kind:42 のように入れられない発言は、入っていなければ押せない。 */
export const bookmarkLook = (event: NostrEvent, bookmarked: boolean) =>
  bookmarked
    ? {
        get label() {
          return t("note.eventActions.unbookmark");
        },
        icon: "i-material-symbols:bookmark-rounded",
      }
    : canBookmark(event)
      ? EVENT_ACTION_META.bookmark
      : {
          get label() {
            return t("note.eventActions.bookmarkUnavailable");
          },
          icon: EVENT_ACTION_META.bookmark.icon,
        };

export const pinLook = (event: NostrEvent, pinned: boolean) =>
  pinned
    ? {
        get label() {
          return t("note.eventActions.unpin");
        },
        icon: "i-material-symbols:keep-rounded",
      }
    : canPin(event)
      ? EVENT_ACTION_META.pin
      : {
          get label() {
            return t("note.eventActions.pinUnavailable");
          },
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
  const needsAccount = (dialog: EventDialog | undefined) => {
    switch (dialog) {
      case "reply":
        return t("note.eventActions.gate.reply");
      case "quote":
        return t("note.eventActions.gate.quote");
      case "broadcast":
        return t("note.eventActions.gate.broadcast");
      default:
        return undefined;
    }
  };
  const dispatch = useDispatch();
  const intents = useAppletIntents();
  const openDialog = (dialog: EventDialog | undefined) => {
    const reason = needsAccount(dialog);
    if (reason && !gate(reason)) return;
    // 投稿欄の既定がアップレットなら、返信・引用はそのアップレットで書く。
    if (dialog === "reply" || dialog === "quote") {
      const routed = intents?.routeCompose({ type: dialog, event: event() });
      if (routed) {
        dispatch({
          type: "stack/open",
          ...routed,
          from: event().id,
          direct: true,
        });
        return;
      }
    }
    setOpen(dialog);
  };
  const close = () => setOpen(undefined);
  const view: JSX.Element = (
    <Switch>
      <Match when={open() === "reply"}>
        <TargetComposeDialog
          target={{ type: "reply", event: event() }}
          onClose={close}
        />
      </Match>
      <Match when={open() === "quote"}>
        <TargetComposeDialog
          target={{ type: "quote", event: event() }}
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
