import { type Accessor, createMemo, untrack } from "solid-js";
import {
  COMMENT_KIND,
  commentRefs,
  eventRelayHints,
  threadRoot,
} from "../nostr/event-refs";
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { EventStore } from "../read/event-store";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";

export type CreateThreadSourceOptions = {
  /** いま画面に出ているスレッドの焦点。閉じていれば `undefined`。 */
  focusId: Accessor<string | undefined>;
  store: EventStore;
  /** カラム自身が解決した source の `relays` (Outbox 中は `undefined`、
   * `RELAYS_OVERRIDE` 適用後の値)。上書きの有無自体はこのモジュールの関心事ではない。 */
  columnRelays: Accessor<readonly RelayUrl[] | undefined>;
  /** `?relays=` の e2e 上書き。カラム側と同じ非対称 (既に明示リレーがあるときだけ上書き) を保つ。 */
  relaysOverride: RelayUrl[] | undefined;
};

export type ThreadSource = {
  /** スレッドの根の id。祖先も返信もここへの購読で届く (NIP-10 の root、NIP-22 の `E`)。 */
  rootId: Accessor<string | undefined>;
  /** 根が確定した時点の focus イベントが運ぶ `e` タグのリレーヒントと、focus を受け取ったリレー。 */
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
    return threadRoot(focus)?.id ?? id;
  });

  const relayHints = createMemo<readonly RelayUrl[]>(() => {
    const root = rootId();
    if (!root) return [];
    const id = untrack(options.focusId);
    if (!id) return [];
    const focus = options.store.get(id);
    if (!focus) return [];
    // 検索リレーのように、普段は読まないリレーで見つけた投稿は、根も返信も
    // そこにしか無いことが多い。受け取ったリレーにも聞く。
    const seen = options.store
      .seenRelays(id)
      .map(normalizeRelayUrl)
      .filter((relay) => relay !== undefined);
    return [...new Set([...eventRelayHints(focus), ...seen])];
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

    // カラムの明示リレーとヒントは**足す**もので**置き換えない**——`relays`は
    // Outbox/fallback を使わない唯一の宛先になる。無ければ FALLBACK_RELAYS
    // にヒントを足し（ヒントだけだと 3 本の fallback 同報が narrow される）、
    // どちらも無ければ `relays` ごと省略する（空配列は fallback より悪化）。
    const columnRelays = options.columnRelays() ?? [];
    const hints = relayHints();
    const additiveBase =
      columnRelays.length > 0
        ? columnRelays
        : hints.length > 0
          ? FALLBACK_RELAYS
          : [];
    const relays = [...new Set([...additiveBase, ...hints])];

    const base: NostrSource = {
      type: "nostr",
      filters: [
        { ids: [root] },
        { kinds: [1], "#e": [root] },
        // 返信への返信になったコメントは、根を大文字の `E` でしか指さない。
        { kinds: [COMMENT_KIND], "#E": [root] },
        ...(address ? [{ kinds: [COMMENT_KIND], "#A": [address] }] : []),
      ],
      ...(relays.length > 0 ? { relays } : {}),
    };
    // `?relays=` 上書きはカラムと同じ非対称を保ち、既に明示リレーがある
    // ときだけ上書きする。無条件だと、Outbox 前提のカラムで開いたとき
    // 「fallback へ同報されるはずが上書きでローカルリレーに固定される」
    // という特別扱いがスレッドにだけ生まれる。
    return options.relaysOverride && base.relays
      ? { ...base, relays: options.relaysOverride }
      : base;
  });

  return { rootId, relayHints, source };
};
