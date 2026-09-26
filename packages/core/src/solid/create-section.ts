import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import type { NostrEvent } from "../nostr/event";
import { SectionReader } from "../read/section-reader";
import {
  type NostrSource,
  type Order,
  type Paging,
  type SectionStatus,
  sameSource,
} from "../read/source";
import type { SubscriptionManager } from "../read/subscription-manager";

export type CreateSectionOptions = {
  /** `undefined` は「まだ分からない」。その間は購読を張らず、取得中のまま待つ。 */
  source: Accessor<NostrSource | undefined>;
  order?: Order;
  /** 接続と購読は manager が所有する。 */
  manager: SubscriptionManager;
  /** 指定すると、この件数ずつ取る（`loadMore` で古いものを取り足す）。 */
  pageSize?: number;
  /** ページ送りしないときの件数の上限（`SectionReaderOptions.maxItems`）。 */
  maxItems?: number;
};

export type Section = {
  items: Accessor<NostrEvent[]>;
  status: Accessor<SectionStatus>;
  /** 古い投稿を 1 ページぶん取り足す。 */
  loadMore: () => void;
  paging: Accessor<Paging>;
};

/** 読み取り層の呼び出し側インターフェース。購読の開始・破棄・source 変更時の張り直しは内側で行う。 */
export const createSection = (options: CreateSectionOptions): Section => {
  const [items, setItems] = createSignal<NostrEvent[]>([]);
  const [status, setStatus] = createSignal<SectionStatus>({
    phase: "initial",
  });
  const [paging, setPaging] = createSignal<Paging>("idle");
  let current: SectionReader | undefined;
  // 取る中身が変わって作り直すとき、それまで伸ばした件数から始める。
  let carried: number | undefined;

  // 中身が同じ source に作り直されても張り直さない（カラムの題名や幅を変えたときなど）。
  const source = createMemo(options.source, undefined, {
    equals: (left, right) =>
      left === right ||
      (left !== undefined && right !== undefined && sameSource(left, right)),
  });

  createEffect(() => {
    const next = source();
    if (next === undefined) {
      setItems([]);
      setStatus({ phase: "initial" });
      setPaging("waiting");
      return;
    }
    const reader = new SectionReader({
      source: next,
      order: options.order ?? "created-at-desc",
      // manager が構築時に受け取った store をそのまま使う。呼び出し側が別の store を選べる余地を無くす。
      store: options.manager.store,
      manager: options.manager,
      pageSize: options.pageSize,
      maxItems: options.maxItems,
      initialSize: carried,
    });
    current = reader;

    const sync = () => {
      setItems(reader.items);
      setStatus(reader.status);
      setPaging(reader.paging);
    };

    // subscribe を start() より先に登録する（逆順だと start() が同期発火する onEvent/onEose を取りこぼす）。
    const unsubscribe = reader.subscribe(sync);
    reader.start();
    sync();

    onCleanup(() => {
      carried = reader.items.length;
      unsubscribe();
      reader.stop();
      if (current === reader) current = undefined;
    });
  });

  return {
    items,
    status,
    loadMore: () => current?.loadOlder(),
    paging,
  };
};
