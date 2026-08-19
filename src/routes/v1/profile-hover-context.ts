import { createContext, useContext } from "solid-js";

/**
 * この下ではプロフィールのホバーカードを出さない、という印。
 *
 * `ProfileCard` は自己紹介文を `NoteContent` に通すので、そこに
 * `nostr:npub` の言及があると `<Profile>` が再びホバーカードを生やす ——
 * カードの中からカードが出る入れ子になる。`NoteContent` へ prop を
 * 引き回すと本文の描画にプロフィール固有の事情が漏れるので、context で
 * 印だけを降ろす。
 *
 * **`ProfileHover` ではなく別ファイルに置いている。** `Profile` が
 * `ProfileHover` を、`ProfileHover` が `ProfileCard` を、`ProfileCard` が
 * `NoteContent` を、`NoteContent` が `Profile` を import するため、
 * この印を `ProfileHover` に置くと `ProfileCard` 側から参照した時点で
 * 循環がもう 1 本増える。
 */
const ProfileHoverSuppressed = createContext(false);

export const ProfileHoverSuppressedProvider = ProfileHoverSuppressed.Provider;

export const useProfileHoverSuppressed = (): boolean =>
  useContext(ProfileHoverSuppressed);
