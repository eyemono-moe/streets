import type { ColumnDef } from "@streets/core/deck/deck";
import {
  type DeckUiEvent,
  type DeckUiState,
  deckUiTransition,
  emptyDeckUi,
} from "@streets/core/deck/deck-ui";
import { type ParentComponent, Show } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { useEventActions } from "../actions";
import { columnView } from "../columns/column-views";
import { useLoginGate } from "../login-gate";
import { composeDrafts } from "../note/compose-drafts";
import { ComposeMediator } from "../note/ComposeMediator";
import ComposePanel from "../note/ComposePanel";
import { PipToaster } from "../toast";
import { Mediates, type UiEvent } from "../ui-events";
import { ComposeFab } from "./Nav";
import SidePanel, { SidePanelMotion } from "./SidePanel";

/**
 * ピクチャーインピクチャーの中の枠。カラム 1 本の幅なので、1 列の画面と同じく右下の投稿ボタンから
 * 全面の投稿パネルを開く。デッキのパネルは元のタブに開くので、投稿のパネルだけを
 * この段で受け持つ。
 */
const PipFrame: ParentComponent<{
  /** いま見えているカラム（重ねた一番上の段、無ければそのカラム）。 */
  shown: ColumnDef;
}> = (props) => {
  const gate = useLoginGate();
  const actions = useEventActions();
  // パネルの開け閉めはデッキと同じ規則で、状態だけをこの窓に持つ。
  const [ui, setUi] = createStore<DeckUiState>(emptyDeckUi());
  const apply = (event: DeckUiEvent) =>
    setUi(reconcile(deckUiTransition(unwrap(ui), event)));
  const handle = (event: UiEvent): boolean => {
    switch (event.type) {
      case "deck/open-panel":
      case "deck/toggle-panel":
        if (event.panel !== "compose") return false;
        if (!gate("投稿")) return true;
        apply(event);
        return true;
      case "deck/close-panel":
        if (ui.panel === undefined) return false;
        apply(event);
        return true;
      default:
        return false;
    }
  };
  // 自分の入力欄を持つカラム（チャット）や紹介のカラムでは、送信やログインのボタンと重なる。
  const showsFab = () =>
    actions !== undefined &&
    ui.panel === undefined &&
    columnView(props.shown.source).ownComposer !== true &&
    props.shown.source.kind !== "welcome";
  return (
    <Mediates handle={handle}>
      <div class="relative h-full">
        {props.children}
        <Show when={showsFab()}>
          <ComposeFab />
        </Show>
        <Show when={actions}>
          {(actions) => (
            <SidePanelMotion open={ui.panel === "compose"} full>
              <SidePanel
                title="投稿する"
                icon="i-material-symbols:edit-square-outline-rounded"
                full
              >
                <ComposeMediator
                  send={(text, media, emoji, contentWarning) =>
                    actions().post(text, media, emoji, contentWarning)
                  }
                  failure="投稿できませんでした"
                  onSent={() => apply({ type: "deck/close-panel" })}
                  drafts
                >
                  {(state) => (
                    <ComposePanel state={state} drafts={composeDrafts()} />
                  )}
                </ComposeMediator>
              </SidePanel>
            </SidePanelMotion>
          )}
        </Show>
      </div>
      {/* 書き込みの結果や署名器の承認待ちは、押した窓で見えないと分からない。 */}
      <PipToaster />
    </Mediates>
  );
};

export default PipFrame;
