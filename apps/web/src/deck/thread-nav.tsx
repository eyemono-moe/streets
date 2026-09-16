import { type ParentComponent, createContext, useContext } from "solid-js";

/** 押した投稿のスレッドを、そのカラムの中で開く。 */
export type ThreadNav = { open: (focusId: string) => void };

const ThreadNavContext = createContext<ThreadNav>();

export const ThreadNavProvider: ParentComponent<{ value: ThreadNav }> = (
  props,
) => (
  <ThreadNavContext.Provider value={props.value}>
    {props.children}
  </ThreadNavContext.Provider>
);

/** カラムの外（Storybook や引用の中）では undefined。押しても何も起きない。 */
export const useThreadNav = (): ThreadNav | undefined =>
  useContext(ThreadNavContext);
