import { type ParentComponent, createContext, useContext } from "solid-js";

type OpenThread = (focusId: string) => void;

const ThreadNavContext = createContext<OpenThread>();

export const ThreadNavProvider: ParentComponent<{ open: OpenThread }> = (
  props,
) => (
  <ThreadNavContext.Provider value={props.open}>
    {props.children}
  </ThreadNavContext.Provider>
);

/**
 * スレッドを開く関数。provider が無ければ `undefined` を返し例外は
 * 投げない —— ナビゲーションを持たない面でノートを描くのも正当な使い方。
 */
export const useThreadNav = (): OpenThread | undefined =>
  useContext(ThreadNavContext);
