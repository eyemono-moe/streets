import { defaultDeck } from "@streets/core/deck/deck";
import { warmUpRouting } from "@streets/core/read/bootstrap";
import type { ReadLayer } from "@streets/core/read/read-layer";
import {
  type Component,
  For,
  Match,
  Show,
  Switch,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { EventActionsProvider, createEventActions } from "../actions";
import { setDiagnostics } from "../devtools/diagnostics";
import type { Session } from "../session";
import Column from "./Column";
import { Sidebar, TabBar } from "./Nav";
import { columnMeta } from "./column-meta";
import { relayListState } from "./relay-list";

/** カラムを横に並べられる幅かどうか。狭い端末ではタブで 1 列ずつ見せる。 */
const useIsWide = () => {
  const query = matchMedia("(min-width: 768px)");
  const [wide, setWide] = createSignal(query.matches);
  const sync = () => setWide(query.matches);
  query.addEventListener("change", sync);
  onCleanup(() => query.removeEventListener("change", sync));
  return wide;
};

const DeckScreen: Component<{ readLayer: ReadLayer; session: Session }> = (
  props,
) => {
  // App が pubkey ごとに作り直すので、この画面の間 viewer は変わらない。
  // biome-ignore lint/style/noNonNullAssertion: ログイン中にしか描かれない
  const viewer = props.session.pubkey()!;
  const actions = createEventActions({
    readLayer: props.readLayer,
    signer: props.session.signer,
    viewer,
  });
  const isWide = useIsWide();
  // カラムの追加・削除・並べ替えと保存はこの後の PR で作る。今は既定のデッキを出す。
  const deck = defaultDeck(viewer);
  const [active, setActive] = createSignal(deck.columns[0]?.id);

  const [warmUp] = createResource(props.session.pubkey, async (pubkey) => {
    // 水和を待たずに始めると、空のストアを「キャッシュ無し」と見なして全員分を取り直す。
    await props.readLayer.ready;
    const startedAt = performance.now();
    const result = await warmUpRouting({
      pubkey,
      store: props.readLayer.store,
      pool: props.readLayer.manager.pool,
    });
    setDiagnostics("warmUp", {
      ...result,
      totalMs: performance.now() - startedAt,
    });
    return result;
  });
  const settled = () => warmUp.state === "ready" || warmUp.state === "errored";
  const followees = () => warmUp()?.followees ?? [];
  const relayList = () =>
    relayListState(props.readLayer.store, viewer, settled());

  const activeColumn = () =>
    deck.columns.find((column) => column.id === active());
  const shared = {
    get readLayer() {
      return props.readLayer;
    },
    viewer,
    followees,
    relayList,
  };

  return (
    <EventActionsProvider value={actions}>
      <Switch>
        <Match when={warmUp.error}>
          <p role="alert" class="c-danger p-4 text-caption">
            フォローリストを取得できませんでした。
          </p>
        </Match>
        <Match when={isWide()}>
          <div class="flex h-dvh">
            <Sidebar pubkey={viewer} onLogout={props.session.logout} />
            {/* カラムの間の 1px を背景色で見せる。横に溢れたら横スクロールする。 */}
            <div class="flex min-w-0 flex-1 gap-px overflow-x-auto bg-tertiary">
              <For each={deck.columns}>
                {(column) => (
                  <div class="h-full w-95 shrink-0">
                    <Column column={column} {...shared} />
                  </div>
                )}
              </For>
            </div>
          </div>
        </Match>
        <Match when={true}>
          <div class="flex h-dvh flex-col">
            <div class="h-0.75 shrink-0 bg-accent-primary" />
            <div class="flex shrink-0 items-center gap-1 overflow-x-auto bg-primary px-2">
              <For each={deck.columns}>
                {(column) => (
                  <button
                    type="button"
                    class="flex h-11 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 bg-transparent px-3 text-body"
                    classList={{
                      "c-primary font-600": active() === column.id,
                      "c-secondary": active() !== column.id,
                    }}
                    onClick={() => setActive(column.id)}
                  >
                    <span class="flex items-center gap-1.5">
                      <span
                        class={`size-4 ${columnMeta(column).icon}`}
                        aria-hidden="true"
                      />
                      {column.title}
                    </span>
                    <span
                      class="h-0.5 w-6 rounded-full"
                      classList={{
                        "bg-accent-primary": active() === column.id,
                      }}
                    />
                  </button>
                )}
              </For>
              {/* カラム設定はこの後の PR で作る。場所だけ取っておく。 */}
              <button
                type="button"
                aria-label="カラムの設定（未対応）"
                class="c-secondary grid size-8 shrink-0 place-items-center rounded-2 bg-transparent opacity-50"
                disabled
              >
                <span
                  class="i-material-symbols:more-horiz size-4.5"
                  aria-hidden="true"
                />
              </button>
            </div>
            <div class="min-h-0 flex-1">
              <Show when={activeColumn()}>
                {(column) => (
                  <Column column={column()} chrome={false} {...shared} />
                )}
              </Show>
            </div>
            <TabBar pubkey={viewer} onLogout={props.session.logout} />
          </div>
        </Match>
      </Switch>
    </EventActionsProvider>
  );
};

export default DeckScreen;
