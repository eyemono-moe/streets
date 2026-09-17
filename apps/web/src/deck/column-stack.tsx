import type { ColumnDef } from "@streets/core/deck/deck";
import { type ParentComponent, createContext, useContext } from "solid-js";

/**
 * カラムの上にカラムを重ねる口。重ねるものはただのカラム定義で、
 * スレッドもユーザー詳細も外から見れば同じ「カラム」。
 */
export type ColumnStack = {
  /** 一番上へ積む。同じ id が既に一番上なら何もしない。 */
  push: (column: ColumnDef) => void;
};

const ColumnStackContext = createContext<ColumnStack>();

export const ColumnStackProvider: ParentComponent<{ value: ColumnStack }> = (
  props,
) => (
  <ColumnStackContext.Provider value={props.value}>
    {props.children}
  </ColumnStackContext.Provider>
);

/** カラムの外（Storybook など）では undefined。押しても何も起きない。 */
export const useColumnStack = (): ColumnStack | undefined =>
  useContext(ColumnStackContext);
