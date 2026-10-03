import { type Accessor, createMemo, untrack } from "solid-js";
import {
  COMMENT_KIND,
  type EventRef,
  commentRefs,
  eventRelayHints,
  threadRoot,
} from "../nostr/event-refs";
import type { EventStore } from "../read/event-store";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";

export type CreateThreadSourceOptions = {
  /** いま画面に出ているスレッドの焦点。閉じていれば `undefined`。 */
  focusId: Accessor<string | undefined>;
  store: EventStore;
  /**
   * 上へたどって欠けていた返信先。根の購読では届かないことがある（`root` の印が
   * 無い返信では、根が分からないまま焦点を根として購読している）ので、id で取る。
   */
  ancestors?: Accessor<readonly Extract<EventRef, { form: "id" }>[]>;
  /**
   * 上へたどり着いた一番上。`root` の印が無い返信では、これを根として返信を集める。
   */
  reachedTop?: Accessor<string | undefined>;
};

export type ThreadSource = {
  /** スレッドの根の id。祖先も返信もここへの購読で届く (NIP-10 の root、NIP-22 の `E`)。 */
  rootId: Accessor<string | undefined>;
  /** 根が確定した時点の focus イベントが運ぶ `e` タグのリレーヒント。 */
  relayHints: Accessor<readonly RelayUrl[]>;
  source: Accessor<NostrSource>;
};

/**
 * スレッドの購読先 (`NostrSource`) を組み立てる。`SubscriptionManager` 無しで
 * Solid の反応性だけをテストするため `DeckColumn.tsx` から切り出した。
 *
 * `rootId` が変わらない限り `relayHints`/`source` は再計算しない —— `createSection`
 * は `source()` の参照が変わるたび購読を張り直し `items` を積み直すので。
 * `relayHints` は `rootId()` のみを追跡し `focusId` の実読みは `untrack` で
 * 切り離すことで、新しい配列参照を返しても再計算を伝播させない。
 */
export const createThreadSource = (
  options: CreateThreadSourceOptions,
): ThreadSource => {
  const rootId = createMemo(() => {
    const id = options.focusId();
    if (!id) return undefined;
    // `store.get` は非リアクティブな一発読みなので、まだ store に無い
    // イベントを渡すと「自分自身が根」に固定されたまま直らない。今は
    // `focusId` が描画済みノートのクリックからしか変わらないので起きないが、
    // 深いリンクや未取得 mention から焦点を変える経路を足すと崩れる。
    const focus = options.store.get(id);
    if (!focus) return id;
    return threadRoot(focus)?.id ?? options.reachedTop?.() ?? id;
  });

  const relayHints = createMemo<readonly RelayUrl[]>(() => {
    const root = rootId();
    if (!root) return [];
    const id = untrack(options.focusId);
    if (!id) return [];
    const focus = options.store.get(id);
    return focus ? eventRelayHints(focus) : [];
  });

  // 記事などへのコメントは根を id で持たない（`E` が無い）。同じ住所へのコメントを集める。
  const rootAddress = createMemo(() => {
    const root = rootId();
    if (!root) return undefined;
    const event = options.store.get(root);
    const scope = event ? commentRefs(event)?.root : undefined;
    return scope?.form === "address" ? scope.address : undefined;
  });

  const source = createMemo<NostrSource>(() => {
    const root = rootId();
    const address = rootAddress();
    // 根が無ければフィルタ 0 本 —— `planQuery` はフィルタを 1 本ずつ見て
    // リレーを割り当てるので 0 本なら「何も購読しない」で安全（`authors: []`
    // や `{}` 単体、resolve-source.ts の followees の罠とは別物）。
    if (!root) return { type: "nostr", filters: [] };

    // 焦点への返信は、焦点の id でも集める。`reply` の印だけで書かれた返信は根を指さない。
    const focus = untrack(options.focusId);
    const replyTo = focus && focus !== root ? [root, focus] : [root];
    const ancestors = options.ancestors?.() ?? [];
    // 根や返信は著者を指定しない問い合わせなので、行き先は読み取り層の既定に
    // 任せ、ヒントはそこへ足す。
    const hints = [
      ...new Set([
        ...relayHints(),
        ...ancestors.flatMap((ref) => (ref.relay ? [ref.relay] : [])),
      ]),
    ];
    return {
      type: "nostr",
      filters: [
        { ids: [root, ...ancestors.map((ref) => ref.id)] },
        // 書いた人が分かっている返信先は、その人のリレーにも聞く。
        ...ancestors.flatMap((ref) =>
          ref.pubkey ? [{ ids: [ref.id], authors: [ref.pubkey] }] : [],
        ),
        { kinds: [1], "#e": replyTo },
        // 返信への返信になったコメントは、根を大文字の `E` でしか指さない。
        { kinds: [COMMENT_KIND], "#E": [root] },
        ...(focus && focus !== root
          ? [{ kinds: [COMMENT_KIND], "#e": [focus] }]
          : []),
        ...(address ? [{ kinds: [COMMENT_KIND], "#A": [address] }] : []),
      ],
      ...(hints.length > 0 ? { extraRelays: hints } : {}),
    };
  });

  return { rootId, relayHints, source };
};
