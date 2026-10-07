import type { ParentComponent } from "solid-js";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";

/**
 * ログインの要るイベントと、ログインすればできること。ログインしている画面では
 * それぞれの段が裁定するが、ログインしていない画面にはその段が無いので、ここで
 * 受けてログインを案内する。
 */
const NEEDS_ACCOUNT: Partial<Record<UiEvent["type"], string>> = {
  "note/repost": "リポスト",
  "note/react": "リアクション",
  "note/react-made": "リアクション",
  "note/vote": "投票",
  "note/bookmark": "ブックマーク",
  "note/pin": "ピン留め",
  "note/broadcast": "ほかのリレーへの送り直し",
  "user/follow": "フォロー",
  "channel/favorite": "チャンネルのお気に入り",
  "channel-form/open-create": "チャンネルづくり",
  "channel-form/open-edit": "チャンネルの編集",
  "zap/open": "Zap",
  "status/edit": "ステータスの設定",
  "mutes/add": "ミュート",
  "mutes/remove": "ミュート",
  "follow-sets/create": "リストづくり",
  "follow-sets/add": "リストの編集",
  "follow-sets/remove": "リストの編集",
  "follow-sets/move": "リストの編集",
  "follow-sets/delete": "リストの編集",
  "emoji/add": "絵文字の登録",
  "emoji/add-made": "絵文字の登録",
  "emoji/prepare-made": "カスタム絵文字づくり",
  "emoji/remove": "絵文字の登録",
  "emoji-set/add": "絵文字の登録",
  "emoji-set/remove": "絵文字の登録",
  "deck/set-client-tag": "アカウントの設定",
  "deck/set-notify-quoted": "アカウントの設定",
};

/** ログインしていない画面で、ログインの要るイベントを受けてログインを案内する段。 */
const GuestMediator: ParentComponent = (props) => {
  const dispatch = useDispatch();
  const handle = (event: UiEvent): boolean => {
    // 投稿のパネルだけは、開く前に止める（書いてから送れないと分かるのを避ける）。
    if (
      event.type === "deck/open-panel" ||
      event.type === "deck/toggle-panel"
    ) {
      if (event.panel !== "compose") return false;
      dispatch({ type: "deck/login", what: "投稿" });
      return true;
    }
    const what = NEEDS_ACCOUNT[event.type];
    if (what === undefined) return false;
    dispatch({ type: "deck/login", what });
    return true;
  };
  return <Mediates handle={handle}>{props.children}</Mediates>;
};

export default GuestMediator;
