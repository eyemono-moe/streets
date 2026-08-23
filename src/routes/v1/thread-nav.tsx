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
 * このノートを起点にスレッドを開く関数。**provider が無ければ
 * `undefined` を返し、例外を投げない。**
 *
 * `useRender()` が投げるのは「provider を渡し忘れた」が常に配線ミスだから
 * だが、こちらは違う —— ノートを描く面すべてがスレッドへのナビゲーションを
 * 持つとは限らない。ナビゲーションを持たない面でノートを描くのは正当な
 * 使い方であり、そこではノートが押せないだけでよい。投げると、その面が
 * スレッドと無関係に落ちる。
 */
export const useThreadNav = (): OpenThread | undefined =>
  useContext(ThreadNavContext);
