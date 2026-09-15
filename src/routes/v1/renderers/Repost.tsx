import { Show } from "solid-js";
import type { Component } from "solid-js";
import type { NostrEvent } from "../../../core/nostr/event";
import {
  embeddedRepostEvent,
  repostTarget,
} from "../../../core/nostr/event-refs";
import type { EventStore } from "../../../core/read/event-store";
import type { RelayUrl } from "../../../core/relay/relay-connection";
import { useRender } from "../../../core/view/render-context";
import EventView from "../EventView";
import Profile from "../Profile";

type RepostTarget = { id: string; relay?: RelayUrl };

/**
 * 対象 id は (1) 埋め込み (NIP-18) が `store.put` の schnorr 検証を通れば
 * それ、(2) だめなら e タグ、(3) どちらも無ければ undefined、の優先順で
 * 決める (埋め込みは未検証の任意文字列なので検証を通すまで信用しない)。
 * `k` タグは対象 kind の自己申告に過ぎず実物と食い違いうるので読まない ——
 * 描画は `EventView` が実イベントの kind から決める。
 */
const resolveRepostTarget = (
  event: NostrEvent,
  store: EventStore,
): RepostTarget | undefined => {
  const embedded = embeddedRepostEvent(event);
  if (embedded) {
    // "embedded" を relay に渡す: 埋め込みは未検証の任意文字列なので、
    // 実在リレーが配信したことにして `seenRelays` へ記録すると嘘になる。
    // "embedded" は URL の形をしていないので実リレーと衝突しない。
    const result = store.put(embedded, "embedded");
    if (result !== "rejected") {
      return { id: embedded.id };
    }
  }

  const viaTag = repostTarget(event);
  return viaTag ? { id: viaTag.id, relay: viaTag.relay } : undefined;
};

/**
 * kind:6/16 (テキスト/汎用リポスト) の詳細表示。対象の描画は `EventView`
 * が実イベントの kind から選ぶので、同じコンポーネントを両方の kind に
 * 登録してよく、対象の見た目を一切知らなくてよい。
 */
export const RepostFull: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  // props.event は EventView の Show コールバックが 1 度だけ渡す静的値
  // なので、ここも 1 回だけ計算すれば足りる (reactive にする必要はない)。
  const target = resolveRepostTarget(props.event, ctx.store);

  return (
    <div
      data-testid="repost"
      // 対象を `full` で描くので、祖先の `group/event` を見て自分の
      // padding も潰す (二重 padding 防止)。`group/event` を付けるのは
      // リポスト入れ子 (対象が kind:6/7) でも同じことが起きるため。
      class="group/event space-y-2 p-3 text-body group-[_]/event:p-0"
    >
      <p
        data-testid="repost-by"
        class="c-secondary flex items-center gap-1 text-caption"
      >
        <span class="i-material-symbols:repeat-rounded c-green-5 aspect-square h-auto w-4 shrink-0" />
        {/*
          太字・1 行に丸める。`<Profile>` は変えず外側に `min-w-0 truncate`
          を足し、長い表示名でも「がリポスト」まで 2 行に折り返させない。
        */}
        <span data-testid="repost-by-name" class="min-w-0 truncate font-700">
          <Profile
            pubkey={props.event.pubkey}
            store={ctx.store}
            requests={ctx.profiles}
          />
        </span>
        <span class="shrink-0">がリポスト</span>
      </p>
      <Show
        when={target}
        fallback={
          <p data-testid="repost-unknown" class="c-secondary text-caption">
            リポスト（対象不明）
          </p>
        }
      >
        {(ref) => (
          <EventView id={ref().id} variant="full" relayHint={ref().relay} />
        )}
      </Show>
    </div>
  );
};

/**
 * kind:6/16 の小型表示。「@x がリポスト」の 1 行だけで対象は描かない。
 * `resolveRepostTarget` を呼ばないのは `NoteCompact` と同じ理由 ——
 * 「compact は関連イベントを要求しない」規則をコードで保証するため。
 */
export const RepostCompact: Component<{ event: NostrEvent }> = (props) => {
  const ctx = useRender();
  return (
    <div data-testid="repost" class="space-y-1 text-caption">
      <p data-testid="repost-by" class="c-secondary text-caption">
        <span data-testid="repost-by-name" class="font-700">
          <Profile
            pubkey={props.event.pubkey}
            store={ctx.store}
            requests={ctx.profiles}
          />
        </span>
        がリポスト
      </p>
    </div>
  );
};
