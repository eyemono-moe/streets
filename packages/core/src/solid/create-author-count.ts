import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { type NostrSource, sameSource } from "../read/source";
import type { SubscriptionManager } from "../read/subscription-manager";

export type CreateAuthorCountOptions = {
  /** `undefined` は「まだ分からない」。その間は購読を張らない。 */
  source: Accessor<NostrSource | undefined>;
  manager: SubscriptionManager;
};

/**
 * source に当たるイベントの書き手の数。本体は EventStore に入れず、書き手の
 * pubkey だけを持つ。フォロワー数のように、数だけを見せたいものに使う。
 */
export const createAuthorCount = (
  options: CreateAuthorCountOptions,
): Accessor<number> => {
  const [count, setCount] = createSignal(0);
  const source = createMemo(options.source, undefined, {
    equals: (left, right) =>
      left === right ||
      (left !== undefined && right !== undefined && sameSource(left, right)),
  });

  createEffect(() => {
    const next = source();
    setCount(0);
    if (next === undefined) return;
    const authors = new Set<string>();
    const handle = options.manager.subscribeUnstored(
      next.filters,
      next.relays,
      {
        onEvent: (event) => {
          if (authors.has(event.pubkey)) return;
          authors.add(event.pubkey);
          setCount(authors.size);
        },
        onRelayComplete: () => {},
        onRelayUnreachable: () => {},
        onPlanChanged: () => {},
        onRelayRestarted: () => {},
      },
    );
    onCleanup(() => handle.close());
  });

  return count;
};
