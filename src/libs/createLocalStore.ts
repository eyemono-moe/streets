import { createEffect } from "solid-js";
import { type SetStoreFunction, type Store, createStore } from "solid-js/store";

export function createLocalStore<T extends object>(
  name: string,
): [Store<T | undefined>, SetStoreFunction<T>];
export function createLocalStore<T extends object>(
  name: string,
  init: T,
): [Store<T>, SetStoreFunction<T>];
export function createLocalStore<T extends object>(
  name: string,
  init?: T,
  parser?: (value: string) => T,
): [Store<T>, SetStoreFunction<T>];

export function createLocalStore<T extends object>(
  name: string,
  init?: T,
  parser?: (value: string) => T,
) {
  const localState = localStorage.getItem(name);
  const [state, setState] = createStore<T>(
    localState ? (parser ? parser(localState) : JSON.parse(localState)) : init,
  );
  createEffect(() => localStorage.setItem(name, JSON.stringify(state)));
  return [state, setState];
}
