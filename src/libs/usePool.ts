import { SimplePool } from "nostr-tools";
import type { AbstractSimplePool } from "nostr-tools/abstract-pool";
import { createSignal } from "solid-js";

const createPool = () => {
  return new SimplePool();
};

const [pool] = createSignal<AbstractSimplePool>(createPool());

export const usePool = () => pool();
