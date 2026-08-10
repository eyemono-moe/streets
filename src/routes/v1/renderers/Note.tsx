import { For, Show } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../../core/nostr/event";
import { quoteTargets, replyTarget } from "../../../core/nostr/event-refs";
import { useRender } from "../../../core/view/render-context";
import EventView from "../EventView";
import Profile from "../Profile";

/**
 * 著者・本文・時刻の 3 行。`full`/`compact` の共通部分 —— 旧 `Note.tsx` の
 * 見た目そのもの (e2e が拾う `note-author`/`note-content`/`note-created-at`
 * を変えない)。
 */
const NoteBody: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  return (
    <>
      <p data-testid="note-author" class="text-alpha-600 text-xs">
        <Profile
          pubkey={props.event.pubkey}
          store={ctx.store}
          requests={ctx.profiles}
        />
      </p>
      <p data-testid="note-content" class="whitespace-pre-wrap break-words">
        {props.event.content}
      </p>
      <p data-testid="note-created-at" class="text-alpha-600 text-xs">
        {props.event.created_at}
      </p>
    </>
  );
};

/**
 * kind:1 の詳細表示 (spec 6 節の表)。
 *
 * `replyTarget`/`quoteTargets` は `event-refs.ts` の純関数 —— 呼ぶだけでは
 * 何も取得しない。実際に取得を発行しうるのは、その結果を
 * `<EventView variant="compact">` へ渡した先だけ (`EventView` が store に
 * 無ければ `events.request` を呼ぶ)。
 */
export const NoteFull: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  const reply = () => replyTarget(props.event);
  const quotes = () => quoteTargets(props.event);

  return (
    <article
      data-testid="note"
      class="space-y-1 rounded-2 border border-alpha-300 p-3 text-sm"
    >
      {/*
        返信先は本文の上。`ref.pubkey` があれば `<Profile>` を即座に出す ——
        親イベント (返信元) の到着を待たない。NIP-10 の `e` タグは 5 番目の
        要素に参照先の pubkey を運ぶことがあり (spec 5 節)、それが「取得前に
        著者名を出せる」の実装そのもの。`<EventView variant="compact">` は
        pubkey の有無に関わらず常に続けて描く (親イベント本体はまだ届いて
        いないかもしれない)。
      */}
      <Show when={reply()}>
        {(ref) => (
          <div class="space-y-1">
            <Show when={ref().pubkey}>
              {(pubkey) => (
                <p data-testid="reply-to" class="text-alpha-600 text-xs">
                  <Profile
                    pubkey={pubkey()}
                    store={ctx.store}
                    requests={ctx.profiles}
                  />
                  への返信
                </p>
              )}
            </Show>
            <EventView
              id={ref().id}
              variant="compact"
              relayHint={ref().relay}
            />
          </div>
        )}
      </Show>

      <NoteBody event={props.event} />

      {/*
        引用先は本文の下。`q` タグが event-address (`form: "address"`) を
        指す場合は置換可能イベントの取得が範囲外 (spec 9 節) なので、
        `compact` の代わりに「未対応の参照です」を出す。
      */}
      <For each={quotes()}>
        {(ref) =>
          ref.form === "id" ? (
            <EventView id={ref.id} variant="compact" relayHint={ref.relay} />
          ) : (
            <p data-testid="unsupported-ref" class="text-alpha-600 text-xs">
              未対応の参照です
            </p>
          )
        }
      </For>
    </article>
  );
};

/**
 * kind:1 の小型表示 (spec 6 節の表)。**`replyTarget`/`quoteTargets` を
 * 一切呼ばない** —— 呼ぶこと自体は無害 (純関数) だが、呼ばないと決めて
 * おくことで「関連イベントを一切要求しない」という compact の規則が
 * コードを読むだけで確認できる (この規則が壊れていないかは
 * `Note.test.tsx` がユニットテストで直接主張する)。
 */
export const NoteCompact: Component<{ event: NostrEvent }> = (props) => (
  <article
    data-testid="note"
    class="space-y-1 rounded-2 border border-alpha-300 p-3 text-sm"
  >
    <NoteBody event={props.event} />
  </article>
);
