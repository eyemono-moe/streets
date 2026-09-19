import type { ColumnStackEvent } from "@streets/core/deck/column-stack";
import type { ColumnDef, DeckAppearance } from "@streets/core/deck/deck";
import type { DeckPanel } from "@streets/core/deck/deck-ui";
import type {
  MuteEntry,
  MuteVisibility,
} from "@streets/core/moderation/mute-list";
import type { MuteTarget } from "@streets/core/nostr/build/mute";
import type { ReactionInput } from "@streets/core/nostr/build/reaction";
import type { NostrEvent } from "@streets/core/nostr/event";
import type { ColorScheme } from "@streets/core/settings/color-scheme";
import type { ProfileEditEvent } from "@streets/core/settings/profile-edit";
import type { RelayEditEvent } from "@streets/core/settings/relay-edit";
import type { ComposeEvent } from "@streets/core/view/compose";
import {
  type JSX,
  type ParentComponent,
  createContext,
  useContext,
} from "solid-js";
import type { ColumnPatch } from "./deck/ColumnSettings";

/**
 * View が上へ渡すイベント。View は「何が起きたか」だけを言い、どう裁定するかは
 * 受け取った段の Mediator が決める。
 */
export type UiEvent =
  | ColumnStackEvent
  | ActionEvent
  | DeckEvent
  | ComposeViewEvent
  | RelayViewEvent
  | MuteViewEvent
  | ProfileViewEvent;

/** プロフィールの編集。保存するのは裁定する段。 */
export type ProfileViewEvent = Extract<
  ProfileEditEvent,
  { type: "profile/input" | "profile/save" | "profile/reset" }
>;

/** ミュートの足し外し。まとめて保存するのは裁定する段。 */
export type MuteViewEvent =
  /** `visibility` を省くと、裁定する段が決める（読める限り非公開）。 */
  | { type: "mutes/add"; target: MuteTarget; visibility?: MuteVisibility }
  | { type: "mutes/remove"; entry: MuteEntry };

/** リレーの設定。View は操作を渡すだけで、まとめて保存するのは裁定する段。 */
export type RelayViewEvent = Extract<RelayEditEvent, { type: "relays/edit" }>;

/** 投稿・返信の書きかけに、View から渡すもの。送れた・失敗したは裁定する段が当てる。 */
export type ComposeViewEvent =
  | Extract<ComposeEvent, { type: "compose/input" | "compose/submit" }>
  | { type: "compose/close" };

/** デッキの段が裁定する。カラムの並びの変更は保存し、画面の状態は遷移関数で当てる。 */
export type DeckEvent =
  | { type: "deck/open-panel"; panel: DeckPanel }
  | { type: "deck/close-panel" }
  | { type: "deck/select-column"; id: string }
  /** そのカラムを見せる（広い画面では画面に収まるよう送り、狭い画面ではタブを選ぶ）。 */
  | { type: "deck/focus-column"; id: string }
  | { type: "deck/toggle-settings"; id: string }
  | { type: "deck/drag-start"; id: string }
  | { type: "deck/drag-end" }
  /** 掴んでいたカラムを、このカラムの位置へ差し込む。 */
  | { type: "deck/drop"; targetId: string }
  /** 足す。id は裁定する段が振り直す（重ねた段の id は中身から作ってあり衝突する）。 */
  | { type: "deck/add-column"; column: ColumnDef }
  | { type: "deck/patch-column"; id: string; patch: ColumnPatch }
  | { type: "deck/remove-column"; id: string }
  /** URL から開いた一時カラムを、デッキのカラムとして残す。 */
  | { type: "deck/keep-temp" }
  | { type: "deck/close-temp" }
  | { type: "deck/open-settings" }
  | { type: "deck/close-settings" }
  /** カラーテーマ。この端末に保存する。 */
  | { type: "deck/set-color-scheme"; scheme: ColorScheme }
  /** 色を動かしている途中。当てるだけで保存しない。 */
  | { type: "deck/preview-appearance"; appearance: DeckAppearance }
  /** 色を確定する。デッキと一緒にアカウントへ保存する。 */
  | { type: "deck/set-appearance"; appearance: DeckAppearance }
  /** 保存の進み具合を出すか。この端末に保存する。 */
  | { type: "deck/set-write-progress"; on: boolean }
  /** この端末からログアウトする。 */
  | { type: "deck/logout" };

/** 状態を持たない単発の操作。裁定する段は `actions` を呼ぶだけ。 */
export type ActionEvent =
  | { type: "note/repost"; target: NostrEvent }
  | { type: "note/react"; target: NostrEvent; input: ReactionInput }
  /** `on` は押した後に付いているべき状態。 */
  | { type: "note/bookmark"; target: NostrEvent; on: boolean }
  | { type: "user/follow"; pubkey: string; on: boolean };

type Dispatch = (event: UiEvent) => void;

// Root より上には誰もいない。ここまで来たイベントは裁定する段が無い。
const DispatchContext = createContext<Dispatch>((event) => {
  if (import.meta.env.DEV) {
    console.warn("このイベントを裁定する段がありません", event);
  }
});

/** 上の段へイベントを渡す口。 */
export const useDispatch = (): Dispatch => useContext(DispatchContext);

/**
 * この段で裁定する。`handle` が false を返したイベントは親の段へ渡す
 * （Chain of Responsibility）。DOM のイベントにしないのは、Portal で body の末尾に
 * 出したメニューやダイアログからも、Solid の所有ツリーを辿って届くようにするため。
 */
export const Mediates: ParentComponent<{
  handle: (event: UiEvent) => boolean;
}> = (props): JSX.Element => {
  const parent = useDispatch();
  const dispatch: Dispatch = (event) => {
    if (!props.handle(event)) parent(event);
  };
  return (
    <DispatchContext.Provider value={dispatch}>
      {props.children}
    </DispatchContext.Provider>
  );
};
