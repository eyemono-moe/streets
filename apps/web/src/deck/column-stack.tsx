import type { ColumnDef } from "@streets/core/deck/deck";
import { type ParentComponent, createContext, useContext } from "solid-js";

/**
 * カラムの上に重ねて見せるもの。スレッドだけでなく、ユーザー詳細やフォロー一覧も
 * ここへ積む —— 本質は「カラムを重ねる」ことで、中身は何でもよい。
 */
export type StackEntry =
  | { kind: "thread"; focusId: string }
  | { kind: "column"; column: ColumnDef };

export type ColumnStack = {
  /** 一番上へ積む。同じものが既に一番上なら何もしない。 */
  push: (entry: StackEntry) => void;
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

/** 同じものを二重に積まないための鍵。戻る操作の単位にもなる。 */
export const stackKey = (entry: StackEntry): string =>
  entry.kind === "thread"
    ? `thread:${entry.focusId}`
    : `column:${entry.column.id}`;

/** 重ねたものの題名と、その下に出す戻り先の説明。 */
export const stackTitle = (entry: StackEntry): string =>
  entry.kind === "thread" ? "スレッド" : entry.column.title;
