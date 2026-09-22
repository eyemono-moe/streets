/** サイドバーから開くパネル。 */
export type DeckPanel = "compose" | "add-column" | "search";

/**
 * デッキの画面の状態のうち、保存しないもの。カラムの並びや設定はデッキ（NIP-78）に
 * 保存するので、ここには持たない。
 */
export type DeckUiState = {
  panel: DeckPanel | undefined;
  /** 設定を開いているカラム。同時に開くのは 1 本だけ。 */
  settingsFor: string | undefined;
  /** 狭い画面で選んでいるタブ。一時カラムは `TEMP_COLUMN_ID`。 */
  active: string | undefined;
  /** 並べ替えのために掴んでいるカラム。 */
  dragging: string | undefined;
  /** 設定のダイアログを開いているか。 */
  settingsOpen: boolean;
  /** 「Streets について」のダイアログを開いているか。 */
  aboutOpen: boolean;
};

export type DeckUiEvent =
  | { type: "deck/open-panel"; panel: DeckPanel }
  /** ボタンを押した。同じパネルが開いていれば閉じ、違えばそちらへ移る。 */
  | { type: "deck/toggle-panel"; panel: DeckPanel }
  | { type: "deck/close-panel" }
  | { type: "deck/open-settings" }
  | { type: "deck/close-settings" }
  | { type: "deck/open-about" }
  | { type: "deck/close-about" }
  | { type: "deck/select-column"; id: string }
  | { type: "deck/toggle-settings"; id: string }
  | { type: "deck/drag-start"; id: string }
  /** 離した（どこかへ落とした・外で離した）。 */
  | { type: "deck/drag-end" }
  | { type: "deck/column-added"; id: string }
  | { type: "deck/column-removed"; id: string }
  /**
   * 並んでいるカラムが変わった。`temp` は URL から開いた一時カラムの id で、
   * あればそれを選ぶ。
   */
  | { type: "deck/columns-changed"; ids: readonly string[]; temp?: string };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyDeckUi = (): DeckUiState => ({
  panel: undefined,
  settingsFor: undefined,
  active: undefined,
  dragging: undefined,
  settingsOpen: false,
  aboutOpen: false,
});

export const deckUiTransition = (
  state: DeckUiState,
  event: DeckUiEvent,
): DeckUiState => {
  switch (event.type) {
    case "deck/open-panel":
      return { ...state, panel: event.panel };
    case "deck/toggle-panel":
      return {
        ...state,
        panel: state.panel === event.panel ? undefined : event.panel,
      };
    case "deck/close-panel":
      return state.panel === undefined ? state : { ...state, panel: undefined };
    case "deck/open-settings":
      // 設定はデッキの上に開くダイアログ。パネルは閉じる（狭い画面ではパネルが全面を覆う）。
      return {
        ...state,
        settingsOpen: true,
        aboutOpen: false,
        panel: undefined,
      };
    case "deck/close-settings":
      return state.settingsOpen ? { ...state, settingsOpen: false } : state;
    case "deck/open-about":
      // 設定と同じく、デッキの上に開く。2 つ同時には開かない。
      return {
        ...state,
        aboutOpen: true,
        settingsOpen: false,
        panel: undefined,
      };
    case "deck/close-about":
      return state.aboutOpen ? { ...state, aboutOpen: false } : state;
    case "deck/select-column":
      // タブを選んだらパネルは閉じる。狭い画面ではパネルがカラムを覆っている。
      return { ...state, active: event.id, panel: undefined };
    case "deck/toggle-settings":
      return {
        ...state,
        settingsFor: state.settingsFor === event.id ? undefined : event.id,
      };
    case "deck/drag-start":
      return { ...state, dragging: event.id };
    case "deck/drag-end":
      return state.dragging === undefined
        ? state
        : { ...state, dragging: undefined };
    case "deck/column-added":
      // 足したら、足した先を見せる。パネルは用が済んだので閉じる。
      return { ...state, active: event.id, panel: undefined };
    case "deck/column-removed":
      return {
        ...state,
        settingsFor:
          state.settingsFor === event.id ? undefined : state.settingsFor,
        dragging: state.dragging === event.id ? undefined : state.dragging,
      };
    case "deck/columns-changed": {
      // URL から開いたら、それを選ぶ。消えたカラムを選んだままにしない。
      if (event.temp !== undefined) {
        return state.active === event.temp
          ? state
          : { ...state, active: event.temp };
      }
      if (state.active !== undefined && event.ids.includes(state.active)) {
        return state;
      }
      const first = event.ids[0];
      return state.active === first ? state : { ...state, active: first };
    }
  }
};
