import { createScheduled, debounce } from "@solid-primitives/scheduled";
import { type Accessor, createMemo } from "solid-js";

export function createDebounced<T>(
  signal: Accessor<T>,
  wait: number,
): () => T | undefined;
export function createDebounced<T>(
  signal: Accessor<T>,
  wait: number,
  init: T,
): () => T;
export function createDebounced<T>(
  signal: Accessor<T>,
  wait: number,
  init?: T,
) {
  const scheduled = createScheduled((fn) => debounce(fn, wait));
  return createMemo((p = init) => {
    const v = signal();
    return scheduled() ? v : p;
  });
}
