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

export type EventViewProps = {
  id: string;
  variant: EventVariant;
  /** タグが運ぶリレーヒント。Task 2 のとおり今は使われない。 */
  relayHint?: RelayUrl;
  /** レンダラへそのまま渡す (`EventBodyProps.threadLine`)。 */
  threadLine?: boolean;
  /** レンダラへそのまま渡す (`EventBodyProps.hideReplyPreview`)。 */
  hideReplyPreview?: boolean;
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
  const [event, setEvent] = createSignal<NostrEvent | undefined>();
  const [unresolved, setUnresolved] = createSignal(false);

  createEffect(() => {
    // 依存として追跡するのは props.id だけ —— `Profile.tsx` の
    // createEffect と同じ罠 (この中で event() 自身を読んで分岐すると、
    // setEvent がこの effect を再実行させ、同じ値を set し直して無限
    // ループになる) を避けるため、読むのを id (と relayHint) に絞る。
    const id = props.id;
    const relayHint = props.relayHint;
    setUnresolved(false);

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
            <Body
              event={found()}
              threadLine={props.threadLine}
              hideReplyPreview={props.hideReplyPreview}
            />
          );
        }}
      </Show>
    </div>
  );
};

export default EventView;
