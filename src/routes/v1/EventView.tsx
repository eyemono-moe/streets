import {
  type Component,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import type { NostrEvent } from "../../core/nostr/event";
import type { RelayUrl } from "../../core/relay/relay-connection";
import { useRender } from "../../core/view/render-context";
import {
  type EventVariant,
  rendererFor,
} from "../../core/view/renderer-registry";
import { UnknownKindCompact, UnknownKindFull } from "./UnknownKind";
import { useOptionalMuteList } from "./mute-list";

export type EventViewProps = {
  id: string;
  variant: EventVariant;
  /** タグが運ぶリレーヒント。Task 2 のとおり今は使われない。 */
  relayHint?: RelayUrl;
  /** レンダラへそのまま渡す (`EventBodyProps.threadLine`)。 */
  threadLine?: boolean;
  /** レンダラへそのまま渡す (`EventBodyProps.hideReplyPreview`)。 */
  hideReplyPreview?: boolean;
  /** レンダラへそのまま渡す (`EventBodyProps.disableThreadOpen`)。 */
  disableThreadOpen?: boolean;
};

/**
 * 唯一の描画入口 (design 2 節)。id から `EventStore` を引き、無ければ
 * `events.request` で要求して届くのを待つ。カラムのアイテムも、引用先も、
 * 返信の親も、リポストの対象も、すべてこれ 1 つを通る (Task 4 で配線)。
 *
 * このタスクではまだどこからも呼ばれない —— `rendererFor` が空集合でも
 * 壊れず fallback (`UnknownKind`) を描くことだけを保証する。
 */
const EventView: Component<EventViewProps> = (props) => {
  const ctx = useRender();
  const muteList = useOptionalMuteList();
  const [event, setEvent] = createSignal<NostrEvent | undefined>();
  const [unresolved, setUnresolved] = createSignal(false);
  const [showMuted, setShowMuted] = createSignal(false);
  const [muteError, setMuteError] = createSignal<string>();

  createEffect(() => {
    // 依存として追跡するのは props.id だけ —— `Profile.tsx` の
    // createEffect と同じ罠 (この中で event() 自身を読んで分岐すると、
    // setEvent がこの effect を再実行させ、同じ値を set し直して無限
    // ループになる) を避けるため、読むのを id (と relayHint) に絞る。
    const id = props.id;
    const relayHint = props.relayHint;
    setUnresolved(false);
    setShowMuted(false);
    setMuteError(undefined);

    const check = (): boolean => {
      const found = ctx.store.get(id);
      if (!found) return false;
      setEvent(found);
      return true;
    };

    if (check()) return; // 既に store にある — 要求もリスンも不要

    ctx.events.request(id, relayHint);
    const unsubscribe = ctx.events.subscribe(() => {
      if (check()) {
        unsubscribe();
        return;
      }
      // 無関係なバッチの完了でも呼ばれる (コアレッサは id 単位で通知
      // しない)。自分の id を含むバッチが片付いた (= isUnresolved) ときだけ
      // 「見つからなかった」へ倒す。
      if (ctx.events.isUnresolved(id)) setUnresolved(true);
    });
    onCleanup(unsubscribe);
  });

  return (
    <div data-testid="event-view" data-variant={props.variant}>
      <Show
        when={event()}
        fallback={
          <Show
            when={unresolved()}
            fallback={<p data-testid="event-loading">読み込み中…</p>}
          >
            <p data-testid="event-unresolved">読み込めませんでした</p>
          </Show>
        }
      >
        {(found) => {
          const matches = () => muteList?.matches(found()) ?? [];
          const muteListSettled = () => {
            const phase = muteList?.state().phase;
            return (
              phase === undefined || phase === "missing" || phase === "ready"
            );
          };
          const renderer = rendererFor(ctx.renderers, found().kind);
          // 未登録の kind でも描く —— fallback 経路 (ADR-0003/ADR-0004,
          // design 9 節)。レンダラ集合が空でもここが壊れないことがこの
          // タスクの要求そのもの。
          const Body = renderer
            ? props.variant === "full"
              ? renderer.full
              : renderer.compact
            : props.variant === "full"
              ? UnknownKindFull
              : UnknownKindCompact;
          return (
            <Show
              when={muteListSettled()}
              fallback={
                <div
                  class="m-2 rounded-2 border border-primary bg-secondary p-3 text-caption"
                  data-testid="mute-list-pending"
                >
                  <p class="c-secondary">
                    {muteList?.state().phase === "error"
                      ? "ミュート設定を確認できません。設定画面から再試行してください"
                      : "ミュート設定を確認しています…"}
                  </p>
                </div>
              }
            >
              <Show
                when={showMuted() || matches().length === 0}
                fallback={
                  <div
                    class="m-2 rounded-2 border border-primary bg-secondary p-3 text-caption"
                    data-testid="muted-event"
                  >
                    <p class="c-secondary">ミュートしたイベントです</p>
                    <div class="mt-2 flex gap-2">
                      <button
                        class="cursor-pointer appearance-none rounded-2 border border-primary bg-transparent px-3 py-1.5"
                        data-testid="muted-event-show"
                        type="button"
                        onClick={() => setShowMuted(true)}
                      >
                        一時的に表示
                      </button>
                      <button
                        class="cursor-pointer appearance-none rounded-2 border border-primary bg-transparent px-3 py-1.5"
                        data-testid="muted-event-remove"
                        type="button"
                        onClick={() => {
                          const first = matches()[0];
                          if (!first || !muteList) return;
                          setMuteError(undefined);
                          void muteList.remove(first).catch(() => {
                            setMuteError(
                              muteList.error() ??
                                "ミュートを解除できませんでした。再試行してください",
                            );
                          });
                        }}
                      >
                        1件解除
                      </button>
                    </div>
                    <Show when={muteError()}>
                      {(message) => (
                        <p
                          class="mt-2 text-red-8"
                          data-testid="muted-event-error"
                        >
                          {message()}
                        </p>
                      )}
                    </Show>
                  </div>
                }
              >
                <Body
                  event={found()}
                  threadLine={props.threadLine}
                  hideReplyPreview={props.hideReplyPreview}
                  disableThreadOpen={props.disableThreadOpen}
                />
              </Show>
            </Show>
          );
        }}
      </Show>
    </div>
  );
};

export default EventView;
