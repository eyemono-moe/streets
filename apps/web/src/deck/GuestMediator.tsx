import type { ParentComponent } from "solid-js";
import { t } from "../i18n/locale";
import { Mediates, type UiEvent, useDispatch } from "../ui-events";
import type ja from "./i18n/ja.json";

/** `deck.loginReason` のキー。 */
type LoginReason = keyof (typeof ja)["loginReason"];

/**
 * ログインの要るイベントと、ログインすればできること。ログインしている画面では
 * それぞれの段が裁定するが、ログインしていない画面にはその段が無いので、ここで
 * 受けてログインを案内する。
 */
const NEEDS_ACCOUNT: Partial<Record<UiEvent["type"], LoginReason>> = {
  "note/repost": "repost",
  "note/react": "reaction",
  "note/react-made": "reaction",
  "note/vote": "vote",
  "note/bookmark": "bookmark",
  "note/pin": "pin",
  "note/broadcast": "broadcast",
  "user/follow": "follow",
  "channel/favorite": "channelFavorite",
  "channel-form/open-create": "channelCreate",
  "channel-form/open-edit": "channelEdit",
  "zap/open": "zap",
  "status/edit": "status",
  "mutes/add": "mute",
  "mutes/remove": "mute",
  "follow-sets/create": "listCreate",
  "follow-sets/add": "listEdit",
  "follow-sets/remove": "listEdit",
  "follow-sets/move": "listEdit",
  "follow-sets/delete": "listEdit",
  "emoji/add": "emoji",
  "emoji/add-made": "emoji",
  "emoji/prepare-made": "customEmoji",
  "emoji/remove": "emoji",
  "emoji-set/add": "emoji",
  "emoji-set/remove": "emoji",
  "deck/set-client-tag": "account",
  "deck/set-notify-quoted": "account",
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
      dispatch({ type: "deck/login", reason: t("deck.loginReason.post") });
      return true;
    }
    const reason = NEEDS_ACCOUNT[event.type];
    if (reason === undefined) return false;
    dispatch({ type: "deck/login", reason: t(`deck.loginReason.${reason}`) });
    return true;
  };
  return <Mediates handle={handle}>{props.children}</Mediates>;
};

export default GuestMediator;
