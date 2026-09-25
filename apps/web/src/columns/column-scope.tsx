import type { ColumnDef } from "@streets/core/deck/deck";
import type { ReadLayer } from "@streets/core/read/read-layer";
import type { NostrSource, SectionStatus } from "@streets/core/read/source";
import {
  type Section,
  createSection,
} from "@streets/core/solid/create-section";
import {
  type Accessor,
  type ParentComponent,
  createContext,
  createEffect,
  useContext,
} from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";

/**
 * ブロックが属するカラムについて知ってよいこと。ブロックはカラムの種類を見ず、
 * 見せ方の設定（密度・画像・「表示するもの」など）だけをここから読む。
 */
export type ColumnScopeValue = {
  column: Accessor<ColumnDef>;
  readLayer: ReadLayer;
  /**
   * ブロックが持つセクションの状態を知らせる。カラムは警告をまとめて出す。
   * 呼んだブロックが消えると取り下げる。
   */
  report?: (status: Accessor<SectionStatus>) => void;
};

const ColumnScopeContext = createContext<ColumnScopeValue>();

export const ColumnScope: ParentComponent<{ value: ColumnScopeValue }> = (
  props,
) => (
  <ColumnScopeContext.Provider value={props.value}>
    {props.children}
  </ColumnScopeContext.Provider>
);

/** 外で呼ぶと例外。黙って既定の見せ方で描くと、渡し忘れに気付けない。 */
export const useColumnScope = (): ColumnScopeValue => {
  const scope = useContext(ColumnScopeContext);
  if (!scope) throw new Error("ColumnScope の外でブロックを描いています");
  return scope;
};

/**
 * ブロックが自分のセクションを作る。診断値を devtools へ出し、状態をカラムへ
 * 知らせる。`name` は 1 カラムに複数のセクションを置くときの見分け。
 */
export const createBlockSection = (options: {
  source: Accessor<NostrSource | undefined>;
  pageSize?: number;
  name?: string;
}): Section => {
  const scope = useColumnScope();
  const section = createSection({
    manager: scope.readLayer.manager,
    pageSize: options.pageSize,
    source: options.source,
  });
  const key = () =>
    options.name ? `${scope.column().id}/${options.name}` : scope.column().id;
  createEffect(() =>
    setDiagnostics("sections", key(), {
      ...section.status(),
      items: section.items().length,
    }),
  );
  scope.report?.(section.status);
  return section;
};
