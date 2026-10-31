import { defaultShortcode } from "@streets/core/emoji-maker/url";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import type { EventActions } from "./actions";
import { requestEmoji } from "./emoji/maker/api";
import { rememberEmoji } from "./emoji/recent-emoji";
import { t } from "./i18n/locale";
import { notifyError } from "./toast";
import { type ActionEvent, Mediates, type UiEvent } from "./ui-events";

/**
 * 送っている途中を見分ける鍵。同じ投稿への同じ操作は、どのカラムから押しても
 * 同じ鍵になる —— 同じ投稿を 2 つのカラムに出していても、二重には送らない。
 * いいねと絵文字のリアクションは同じ鍵にする（どちらも kind:7 を 1 件送る操作）。
 */
const pendingKey = (event: ActionEvent): string => {
  switch (event.type) {
    case "note/repost":
      return `repost:${event.target.id}`;
    case "note/react":
    case "note/react-made":
      return `react:${event.target.id}`;
    case "note/vote":
      return `vote:${event.target.id}`;
    case "note/bookmark":
      return `bookmark:${event.target.id}`;
    case "note/pin":
      return `pin:${event.target.id}`;
    case "user/follow":
      return `follow:${event.pubkey}`;
    case "channel/favorite":
      return `favorite-channel:${event.id}`;
    case "note/broadcast":
      return `broadcast:${event.target.id}`;
    case "note/delete":
      return `delete:${event.target.id}`;
  }
};

const PendingContext = createContext<(key: string) => boolean>(() => false);

/**
 * 状態を持たない単発の操作を裁定する段。`actions` を呼び、送っている間は同じ操作を
 * 受け付けず、失敗したらトーストで知らせる。
 */
export const ActionsMediator: ParentComponent<{ actions: EventActions }> = (
  props,
) => {
  const [pending, setPending] = createStore<Record<string, true | undefined>>(
    {},
  );

  const run = (event: ActionEvent, what: string, task: () => Promise<void>) => {
    const key = pendingKey(event);
    if (pending[key]) return;
    setPending(key, true);
    task()
      .catch((cause) => notifyError(cause, what))
      .finally(() => setPending(key, undefined));
  };

  const handle = (event: UiEvent): boolean => {
    const actions = props.actions;
    switch (event.type) {
      case "note/repost":
        run(event, t("app.actionFailed.repost"), () =>
          actions.repost(event.target),
        );
        return true;
      case "note/react":
        run(event, t("app.actionFailed.react"), () =>
          actions.react(event.target, event.input),
        );
        return true;
      case "note/react-made":
        run(event, t("app.actionFailed.reactMade"), async () => {
          const url = await requestEmoji(event.spec);
          const shortcode = event.shortcode ?? defaultShortcode(event.spec);
          await actions.react(event.target, { type: "emoji", shortcode, url });
          rememberEmoji({ kind: "custom", shortcode, url });
        });
        return true;
      case "note/vote":
        run(event, t("app.actionFailed.vote"), () =>
          actions.vote(event.target, event.choices),
        );
        return true;
      case "note/bookmark":
        run(event, t("app.actionFailed.bookmark"), () =>
          actions.setBookmark(event.target, event.on),
        );
        return true;
      case "note/pin":
        run(event, t("app.actionFailed.pin"), () =>
          actions.setPinned(event.target, event.on),
        );
        return true;
      case "user/follow":
        run(event, t("app.actionFailed.follow"), () =>
          actions.setFollow(event.pubkey, event.on),
        );
        return true;
      case "channel/favorite":
        run(event, t("app.actionFailed.favorite"), () =>
          actions.setFavoriteChannel(event.id, event.on),
        );
        return true;
      case "note/broadcast":
        run(event, t("app.actionFailed.broadcast"), () =>
          actions.broadcast(event.target, event.relays),
        );
        return true;
      case "note/delete":
        run(event, t("app.actionFailed.delete"), () =>
          actions.deleteEvent(event.target),
        );
        return true;
      default:
        return false;
    }
  };

  return (
    <PendingContext.Provider value={(key) => pending[key] === true}>
      <Mediates handle={handle}>{props.children}</Mediates>
    </PendingContext.Provider>
  );
};

/** その操作を送っている途中か。押せない見た目にするのに使う。 */
export const useSending = (event: Accessor<ActionEvent>): Accessor<boolean> => {
  const pending = useContext(PendingContext);
  return () => pending(pendingKey(event()));
};
