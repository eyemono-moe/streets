import { type Accessor, createMemo, untrack } from "solid-js";
import { eventRelayHints, threadRoot } from "../nostr/event-refs";
import { FALLBACK_RELAYS } from "../read/default-relays";
import type { EventStore } from "../read/event-store";
import type { NostrSource } from "../read/source";
import type { RelayUrl } from "../relay/relay-connection";

export type CreateThreadSourceOptions = {
  /** いま画面に出ているスレッドの焦点。無ければ (スレッドを閉じていれば)
   * `undefined`。 */
  focusId: Accessor<string | undefined>;
  store: EventStore;
  /** カラム自身が解決した source の `relays` (無ければ Outbox ルーティング
   * 中で `undefined`)。呼び出し側の `RELAYS_OVERRIDE` 適用後の値を渡す ——
   * ここでは「カラムが最終的に使う明示リレー」を知りたいだけで、
   * 上書きの有無自体はこのモジュールの関心事ではない。 */
  columnRelays: Accessor<readonly RelayUrl[] | undefined>;
  /** `?relays=` の e2e 上書き。カラム側と同じ非対称 (既に明示リレーを
   * 持つときだけ上書きする) をここでも保つために渡す。 */
  relaysOverride: RelayUrl[] | undefined;
};

export type ThreadSource = {
  /** スレッドの根の id。祖先も返信もここへの購読 1 本で届く (NIP-10)。 */
  rootId: Accessor<string | undefined>;
  /** 根が確定した時点の focus イベントが運ぶ `e` タグのリレーヒント。 */
  relayHints: Accessor<readonly RelayUrl[]>;
  source: Accessor<NostrSource>;
};

/**
 * スレッドの購読先 (`NostrSource`) を組み立てる。`DeckColumn.tsx` から
 * 独立したモジュールに切り出してあるのは、`SubscriptionManager` や
 * `RenderProvider` を用意しなくても Solid の反応性だけでテストできるように
 * するため —— ここで守りたい性質 (下記) は結線の深いコンポーネントの中では
 * 検証しづらい。
 *
 * **`rootId` が変わらない限り `relayHints`/`source` は再計算されない。**
 * `createSection`（`src/core/solid/create-section.ts`）は `source()` を
 * 読む `createEffect` の中で `SectionReader` を作り直すので、同じ根のまま
 * スレッド内を 1 段進むだけで `source()` が新しいオブジェクトを返すと、
 * 購読が張り直されて `items` が空から積み直しになる (spec 6.1 節)。
 *
 * `rootId` 自体は文字列を返すので、既定の等価性 (`===`) がそのまま
 * 「根が変わっていなければ下流へ通知しない」を実現する。問題は
 * `relayHints` —— 素朴に `focusId()` を直接読んで毎回配列を組み立てると、
 * 中身が同じ (あるいは両方とも空) でも**新しい配列参照**を返してしまい、
 * 既定の等価性ではそれが「変わった」と判定されて `source` まで再計算が
 * 伝播する。`relayHints` の追跡依存を `rootId()` だけに絞り、実際にどの
 * focus を読むかは `untrack` で切り離すことで、根が変わったとき (= この
 * memo 自身が再計算されるとき) にだけヒントを取り直す形にしてある —— 1
 * 段進むだけでは古いヒントのまま据え置かれるが、`rootId` の非リアクティブ
 * な `store.get` (下記) と同じ「安定性を優先し、多少古くてもよい」という
 * 判断を踏襲している。
 */
export const createThreadSource = (
  options: CreateThreadSourceOptions,
): ThreadSource => {
  const rootId = createMemo(() => {
    const id = options.focusId();
    if (!id) return undefined;
    // `store.get` は非リアクティブな一発読み —— この memo は `id` が
    // 変わらない限り再実行されないので、呼んだ時点でまだ store に無い
    // イベントを渡すと「自分自身が根」という誤った結果に固定されたまま
    // 二度と直らない。今のところ `focusId` は画面に描画済み (= 必ず
    // store にある) ノートのクリックからしか変わらないのでこれは起きない
    // —— 深いリンクや未取得の mention から焦点を変える経路を足すときは、
    // この前提が崩れることに注意。
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
    return focus ? eventRelayHints(focus) : [];
  });

  const source = createMemo<NostrSource>(() => {
    const root = rootId();
    // 根が決まっていないときはフィルタ 0 本を渡す。`planQuery`
    // (query-plan.ts) はフィルタを 1 本ずつ見てリレーを割り当てるので、
    // 0 本なら選ばれるリレーも 0 本 —— つまり「何も購読しない」で安全
    // (`authors: []` や `{}` 単体とは別物、resolve-source.ts の
    // followees の罠と混同しないこと)。
    if (!root) return { type: "nostr", filters: [] };

    // カラムの明示リレーとフォーカスしたイベントのヒントは**足す**もの
    // であって、どちらかに**置き換える**ものではない。`relays` を渡すと
    // `SubscriptionManager` はそれを Outbox ルーティングにも fallback
    // にも頼らない「唯一の宛先」として扱う (`explicitRelays` はバイパス
    // であり、足りない分を fallback が補ってはくれない)。
    //
    // - カラムが明示リレーを持つなら、その集合にヒントを足すだけでよい
    //   (fallback はそもそも関係ない)。
    // - カラムが Outbox/`followees` のように著者ベースでルートされて
    //   いる場合 (`columnRelays()` が無い)、素の候補はフィルタに
    //   `authors` が無いことで自然に落ちる先である `FALLBACK_RELAYS`
    //   —— ヒントだけを明示リレーにしてしまうと、本来 3 本へ同報される
    //   はずの fallback をヒント 1 本だけに narrow してしまい、この機能が
    //   改善するはずだったケースをかえって悪化させる (ヒントは古びやすく
    //   外れることも多い)。ヒントを fallback へ**足す**ことで、
    //   カバレッジを狭めずに手がかりを 1 つ増やすだけにする。
    // - どちらも無ければ `relays` フィールドごと省略する (空配列を
    //   明示すると「どこにも送らない」という別の意味になり、fallback
    //   より悪化する)。
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
      filters: [{ ids: [root] }, { kinds: [1], "#e": [root] }],
      ...(relays.length > 0 ? { relays } : {}),
    };
    // `?relays=` の e2e 上書きは、カラムの `source` と同じ非対称を保つ
    // —— 既に (カラム由来かヒント由来かを問わず) 明示リレーを持つとき
    // だけ上書きする。無条件に上書きすると、根が Outbox ルーティング
    // 前提のカラムで開かれたときに「本来 fallback へ同報されるはずが
    // 上書きだけローカルリレーに固定される」という、カラム本体には
    // 起きない特別扱いがスレッドにだけ生まれる。
    return options.relaysOverride && base.relays
      ? { ...base, relays: options.relaysOverride }
      : base;
  });

  return { rootId, relayHints, source };
};
