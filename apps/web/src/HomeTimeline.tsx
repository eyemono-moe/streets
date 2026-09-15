import { TIMELINE_KINDS } from "@streets/core/deck/deck";
import { resolveSource } from "@streets/core/deck/resolve-source";
import { warmUpRouting } from "@streets/core/read/bootstrap";
import type { ReadLayer } from "@streets/core/read/read-layer";
import { createSection } from "@streets/core/solid/create-section";
import {
  type Component,
  For,
  Match,
  Switch,
  createEffect,
  createResource,
} from "solid-js";
import { EventActionsProvider, createEventActions } from "./actions";
import { setDiagnostics } from "./devtools/diagnostics";
import Event from "./note/Event";
import type { Session } from "./session";

const Timeline: Component<{
  readLayer: ReadLayer;
  viewer: string;
  followees: readonly string[];
}> = (props) => {
  const section = createSection({
    manager: props.readLayer.manager,
    source: () =>
      resolveSource(
        { kind: "followees", kinds: [...TIMELINE_KINDS] },
        {
          followees: () => props.followees,
          viewer: props.viewer,
          relayList: () => ({ phase: "signed-out" }),
        },
      ),
  });

  createEffect(() =>
    setDiagnostics("sections", "home", {
      ...section.status(),
      items: section.items().length,
    }),
  );

  return (
    <Switch>
      <Match when={section.items().length > 0}>
        {/* 投稿の間の 1px を背景色で見せる。最後の投稿の下にも線を引く。 */}
        <div class="flex flex-col gap-px bg-tertiary pb-px">
          <For each={section.items()}>
            {(event) => <Event event={event} size="normal" />}
          </For>
        </div>
      </Match>
      <Match when={section.status().phase === "settled"}>
        <p class="c-secondary p-4 text-caption">
          フォロー中の人の投稿はまだありません。
        </p>
      </Match>
      <Match when={true}>
        <p class="c-secondary p-4 text-caption">読み込み中…</p>
      </Match>
    </Switch>
  );
};

const HomeTimeline: Component<{ readLayer: ReadLayer; session: Session }> = (
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

  return (
    <EventActionsProvider value={actions}>
      <div class="flex h-dvh flex-col">
        <header class="flex items-center justify-between gap-2 border-primary border-b px-4 py-2">
          <h1 class="font-bold text-body">ホーム</h1>
          <button
            type="button"
            class="c-secondary bg-transparent text-caption hover:underline"
            onClick={props.session.logout}
          >
            ログアウト
          </button>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Switch>
            <Match when={warmUp.error}>
              <p role="alert" class="c-danger p-4 text-caption">
                フォローリストを取得できませんでした。
              </p>
            </Match>
            <Match when={warmUp()}>
              {(result) => (
                <Timeline
                  readLayer={props.readLayer}
                  viewer={viewer}
                  followees={result().followees}
                />
              )}
            </Match>
            <Match when={true}>
              <p class="c-secondary p-4 text-caption">
                フォローリストを取得中…
              </p>
            </Match>
          </Switch>
        </div>
      </div>
    </EventActionsProvider>
  );
};

export default HomeTimeline;
