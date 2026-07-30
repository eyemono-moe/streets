import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { NostrEvent } from "../nostr/event";
import type { EventStore } from "../read/event-store";
import { SectionReader } from "../read/section-reader";
import type { NostrSource, Order, SectionStatus } from "../read/source";
import type { RelayConnection, RelayUrl } from "../relay/relay-connection";

export type CreateSectionOptions = {
  source: Accessor<NostrSource>;
  order?: Order;
  store: EventStore;
  openRelay: (url: RelayUrl) => RelayConnection;
};

export type Section = {
  items: Accessor<NostrEvent[]>;
  status: Accessor<SectionStatus>;
  loadMore: () => void;
};

/**
 * 読み取り層の呼び出し側インターフェース (ADR-0014)。
 * 購読の開始・破棄・source 変更時の張り直しは内側で行う。
 */
export const createSection = (options: CreateSectionOptions): Section => {
  const [items, setItems] = createSignal<NostrEvent[]>([]);
  const [status, setStatus] = createSignal<SectionStatus>({
    phase: "initial",
  });

  createEffect(() => {
    const reader = new SectionReader({
      source: options.source(),
      order: options.order ?? "created-at-desc",
      store: options.store,
      openRelay: options.openRelay,
    });

    const sync = () => {
      setItems(reader.items);
      setStatus(reader.status);
    };

    // subscribe を start() より先に登録する。逆順だと start() が同期的に
    // onEvent/onEose を発火した場合に取りこぼす。
    const unsubscribe = reader.subscribe(sync);
    reader.start();
    sync();

    onCleanup(() => {
      unsubscribe();
      reader.stop();
    });
  });

  return {
    items,
    status,
    // ページネーションは後続の計画で実装する
    loadMore: () => {},
  };
};
