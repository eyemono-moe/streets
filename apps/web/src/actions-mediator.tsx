import {
  type Accessor,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import type { EventActions } from "./actions";
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
      return `react:${event.target.id}`;
    case "note/bookmark":
      return `bookmark:${event.target.id}`;
    case "user/follow":
      return `follow:${event.pubkey}`;
    case "channel/favorite":
      return `favorite-channel:${event.id}`;
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
        run(event, "リポストできませんでした", () =>
          actions.repost(event.target),
        );
        return true;
      case "note/react":
        run(event, "リアクションを送れませんでした", () =>
          actions.react(event.target, event.input),
        );
        return true;
      case "note/bookmark":
        run(event, "ブックマークを保存できませんでした", () =>
          actions.setBookmark(event.target, event.on),
        );
        return true;
      case "user/follow":
        run(event, "フォローの状態を保存できませんでした", () =>
          actions.setFollow(event.pubkey, event.on),
        );
        return true;
      case "channel/favorite":
        run(event, "お気に入りを保存できませんでした", () =>
          actions.setFavoriteChannel(event.id, event.on),
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
