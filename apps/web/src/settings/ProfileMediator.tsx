import { mergeProfile } from "@streets/core/nostr/build/profile";
import type { NostrEvent } from "@streets/core/nostr/event";
import {
  type ProfileEditEvent,
  type ProfileEditState,
  emptyProfileEdit,
  isProfileDirty,
  profileChanges,
  profileEditTransition,
  profileErrors,
} from "@streets/core/settings/profile-edit";
import type { Writer } from "@streets/core/write/writer";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  createSignal,
  on,
  onCleanup,
  useContext,
} from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { notifyError, notifySaved } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";

const PROFILE_KIND = 0;

export type ProfileEdit = {
  /** 編集しているのは誰のプロフィールか（ログインしている人）。 */
  pubkey: string;
  state: ProfileEditState;
  loaded: Accessor<boolean>;
  /**
   * 書きかけのまま閉じようとした回数。増えたら、画面は書きかけの場所へ
   * 目を向けさせる（ページを切り替え、保存の欄を見せて揺らす）。
   */
  attention: Accessor<number>;
};

const ProfileEditContext = createContext<ProfileEdit>();

/**
 * プロフィールの編集を裁定する段。書きかけを持ち、「保存」で変えた項目だけを
 * 最新の版へ重ねて保存する。デッキの段に置くので、ダイアログを閉じても書きかけは
 * 残る。
 */
export const ProfileMediator: ParentComponent<{
  writer: Pick<Writer, "replace">;
  pubkey: string;
  profile: Accessor<NostrEvent | undefined>;
}> = (props) => {
  const [state, setState] = createStore(emptyProfileEdit());
  const apply = (event: ProfileEditEvent) =>
    setState(reconcile(profileEditTransition(unwrap(state), event)));

  createEffect(
    on(props.profile, (event) =>
      apply({ type: "profile/loaded", content: event?.content }),
    ),
  );

  const save = () => {
    // 判断は当てる前に済ませる。unwrap は store の中身そのもので、reconcile が
    // その場で書き換えるので、当てた後に読むと当てた後の値になっている。
    const current = unwrap(state);
    if (current.saving) return;
    if (Object.keys(profileErrors(current.draft)).length > 0) return;
    apply({ type: "profile/save" });
    if (!unwrap(state).saving) return;
    const changes = profileChanges(unwrap(state));
    props.writer.replace(PROFILE_KIND, undefined, mergeProfile(changes)).then(
      () => {
        apply({ type: "profile/saved" });
        notifySaved("プロフィールを保存しました");
      },
      (cause) => {
        apply({ type: "profile/failed" });
        notifyError(cause, "プロフィールを保存できませんでした");
      },
    );
  };

  const [attention, setAttention] = createSignal(0);
  const dirty = () => isProfileDirty(state);

  // タブを閉じる・再読み込みするときも、書きかけがあればブラウザに確かめさせる。
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!dirty()) return;
    event.preventDefault();
  };
  window.addEventListener("beforeunload", beforeUnload);
  onCleanup(() => window.removeEventListener("beforeunload", beforeUnload));

  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "deck/close-settings":
        // 書きかけがあるうちは閉じさせない。黙って閉じると、開き直したときに
        // 書きかけが残っているのか消えたのか分からない。保存か「元に戻す」で抜ける。
        if (!dirty()) return false;
        setAttention((count) => count + 1);
        return true;
      case "profile/input":
      case "profile/reset":
        apply(event);
        return true;
      case "profile/save":
        save();
        return true;
      default:
        return false;
    }
  };

  return (
    <ProfileEditContext.Provider
      value={{
        pubkey: props.pubkey,
        state,
        loaded: () => props.profile() !== undefined,
        attention,
      }}
    >
      <Mediates handle={handle}>{props.children}</Mediates>
    </ProfileEditContext.Provider>
  );
};

export const useProfileEdit = (): ProfileEdit | undefined =>
  useContext(ProfileEditContext);
