import { createContext, useContext } from "solid-js";

/**
 * この下ではホバーカードを出さない、という印。`ProfileCard` は自己紹介文を
 * `NoteContent` に通すので、そこに `nostr:npub` があるとカードの中から
 * カードが出る。
 *
 * `ProfileHover` ではなく別ファイルに置くのは、`Profile` → `ProfileHover`
 * → `ProfileCard` → `NoteContent` → `Profile` の循環がもう 1 本増えるため。
 */
const ProfileHoverSuppressed = createContext(false);

export const ProfileHoverSuppressedProvider = ProfileHoverSuppressed.Provider;

export const useProfileHoverSuppressed = (): boolean =>
  useContext(ProfileHoverSuppressed);
