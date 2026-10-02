import { type ParentComponent, createContext, useContext } from "solid-js";
import type { EventActions } from "./actions";

/**
 * ログインの要る操作の手前で呼ぶ。続けてよければ true。ログインしていなければ
 * ログインを案内して false を返す —— 書いてから「送れませんでした」と言うより、
 * 書き始める前に伝える。
 */
export type LoginGate = (what: string) => boolean;

// ログインしている画面では、何もせずに通す。
const LoginGateContext = createContext<LoginGate>(() => true);

export const LoginGateProvider: ParentComponent<{ value: LoginGate }> = (
  props,
) => (
  <LoginGateContext.Provider value={props.value}>
    {props.children}
  </LoginGateContext.Provider>
);

export const useLoginGate = (): LoginGate => useContext(LoginGateContext);

/** 書き込みの手前で止め損ねたとき。止める場所の書き忘れなので、トーストに出す。 */
class LoginRequiredError extends Error {
  constructor() {
    super("ログインが必要です");
  }
}

const refuse = async (): Promise<never> => {
  throw new LoginRequiredError();
};

/**
 * ログインしていない人の操作。読むものは空にし、書くものは断る。押せる見た目は
 * そのまま残し、押したときの案内は `LoginGate` と、デッキの段が受ける。
 */
export const createGuestActions = (): EventActions => ({
  viewer: "",
  bookmarkIds: () => [],
  post: refuse,
  reply: refuse,
  quote: refuse,
  channelMessage: refuse,
  repost: refuse,
  setStatus: refuse,
  vote: refuse,
  react: refuse,
  bookmarked: () => false,
  setBookmark: refuse,
  pinned: () => false,
  setPinned: refuse,
  createChannel: refuse,
  editChannel: refuse,
  muteInChat: refuse,
  favoriteChannelIds: () => [],
  setFavoriteChannel: refuse,
  followeeIds: () => [],
  following: () => false,
  setFollow: refuse,
  broadcastTargets: () => ({ mine: [], author: [] }),
  broadcast: refuse,
});
