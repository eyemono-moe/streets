import { For, Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import type { ColumnDef } from "../../core/deck/deck";
import { resolveSource } from "../../core/deck/resolve-source";
import type { NostrEvent } from "../../core/nostr/event";
import type { EventStore } from "../../core/read/event-store";
import { matchesAnyFilter } from "../../core/read/filter-match";
import type { ProfileRequests } from "../../core/read/profile-requests";
import type { NostrSource } from "../../core/read/source";
import type { SubscriptionManager } from "../../core/read/subscription-manager";
import { createSection } from "../../core/solid/create-section";
import Note from "./Note";
import { parseRelays } from "./parse-relays";

/**
 * `?relays=` でローカルリレーへ上書きする (parse-relays.ts 参照)。
 * `v1.tsx` にも同じ計算があるが、両者は同じ入力 (URL のクエリ文字列) から
 * 導く純粋な変換であり、モジュールをまたいで値を共有する必要がない ——
 * 1 箇所を import し合うより、それぞれのモジュールで独立に計算したほうが
 * 「どこで何が決まるか」が閉じて読みやすい。
 */
const RELAYS_OVERRIDE = parseRelays(
  new URLSearchParams(window.location.search).get("relays"),
);

/**
 * デッキの 1 本のカラム。`createSection` を own する単位を `<For>` の
 * コールバックではなくコンポーネントとして切り出しているのは、カラムの
 * 追加・削除 (将来) で `createEffect`/`onCleanup` の対応関係を素直に
 * Solid の所有者ツリーへ委ねるため。
 *
 * `?relays=` (RELAYS_OVERRIDE) が効いている間は、明示リレーを持つカラム
 * (`defaultDeck` の "global" 列など) の `relays` もローカルリレーへ
 * 差し替える。これをしないと `defaultDeck` が焼き込んだ本物のリレー
 * (`FALLBACK_RELAYS`) へ e2e が外部ネットワーク越しに繋ぎに行ってしまい、
 * ローカルシードでは検証できなくなる — `fallbackRelays`/`indexers` に
 * 対する上と同じ上書きの立て付け。
 */
const DeckColumn: Component<{
  column: ColumnDef;
  store: EventStore;
  manager: SubscriptionManager;
  profileRequests: ProfileRequests;
  /**
   * 現在の閲覧者のフォローリスト (kind:1 の pubkey 集合)。`source` が
   * `kind: "followees"` のとき `resolveSource` がこれを著者フィルタへ
   * 展開する。デッキ自体はこの値を焼き込まない (`resolve-source.ts` 参照)
   * ので、フォローが増減しても呼び出し元がこの関数を最新の値で呼び直す
   * だけで反映される。
   */
  followees: () => readonly string[];
  /**
   * 投稿フォームが署名直後に楽観挿入した、まだリレーから戻って
   * きていない自分の投稿。`SectionReader` は購読経由でしか items を更新
   * できない (`store.put()` を直接呼んでも拾わない) ので、表示側でこの
   * リストを重ね合わせる。
   */
  optimisticEvents: () => NostrEvent[];
}> = (props) => {
  const source = createMemo<NostrSource>(() => {
    const resolved = resolveSource(props.column.source, {
      followees: props.followees(),
    });
    // `?relays=` の e2e 上書きは**解決した後**に当てる —— 上書きが見るのは
    // `NostrSource.relays` であって `ColumnSource` ではない。順序を逆に
    // すると、明示リレーを持つカラムがローカルリレーへ差し替わらず、
    // e2e が外部ネットワークへ繋ぎに行く。
    return RELAYS_OVERRIDE && resolved.relays
      ? { ...resolved, relays: RELAYS_OVERRIDE }
      : resolved;
  });

  const section = createSection({
    source,
    store: props.store,
    manager: props.manager,
  });

  /**
   * 楽観挿入とセクション本体の items をマージする (仕様 6 節、受け入れ確認
   * 1, 2)。
   *
   * - このカラムのフィルタに合わないもの (他人の投稿を映すカラムに自分の
   *   投稿を混ぜない) は素通しで除く —— `matchesAnyFilter` はローカル
   *   フィルタ照合そのもの (ADR-0023) で、リレーへ実際に送っている REQ と
   *   同じ判定を使う。
   * - `section.items()` に同じ id が既に載っているものは除く —— リレーが
   *   自分の投稿をエコーして本物の経路に乗った後は、そちらを正として二重
   *   表示しない (self-follow で自分の投稿が戻ってくるのは普通に起こる)。
   */
  const items = createMemo(() => {
    const fromSection = section.items();
    const knownIds = new Set(fromSection.map((event) => event.id));
    const optimistic = props
      .optimisticEvents()
      .filter(
        (event) =>
          !knownIds.has(event.id) && matchesAnyFilter(event, source().filters),
      );
    return [...optimistic, ...fromSection];
  });

  return (
    <section
      data-testid="deck-column"
      data-column-id={props.column.id}
      class="h-full w-100 shrink-0 space-y-2 overflow-y-auto border-alpha-300 border-r p-3 last:border-r-0"
    >
      <h2 class="font-bold" data-testid="deck-column-title">
        {props.column.title}
      </h2>
      <p class="text-alpha-600 text-xs" data-testid="deck-column-phase">
        phase: {section.status().phase}
      </p>
      {/*
        仕様 7 節が要求する「`status.incomplete` の生の数値をそのまま見せる」。
        ADR-0011 は欠落を黙って隠すことを禁じており、ユーザー向けの翻訳層は
        繰延にしたので、ここでは診断値のまま出す。

        Task 2 の単一カラムでは出していたが、Task 3 で `DeckColumn` へ書き直した
        際に落ちていた (2026-08-05 に人手で発見)。3 つのレビューが見落としたのは、
        この要求が spec の別の節 (エラー処理表) にあり、Task 3 の受け入れ確認が
        カラム数・リロード・localStorage に向いていたためである。
      */}
      <Show when={section.status().incomplete}>
        {(incomplete) => (
          <p
            class="text-alpha-600 text-xs"
            data-testid="deck-column-incomplete"
          >
            unreachableRelays: {incomplete().unreachableRelays} /
            unroutableAuthors: {incomplete().unroutableAuthors} /
            uncoveredAuthors: {incomplete().uncoveredAuthors}
          </p>
        )}
      </Show>
      <ul data-testid="items" class="space-y-2">
        <For each={items()}>
          {(event) => (
            <li data-testid="item">
              <Note
                event={event}
                store={props.store}
                profileRequests={props.profileRequests}
              />
            </li>
          )}
        </For>
      </ul>
    </section>
  );
};

export default DeckColumn;
