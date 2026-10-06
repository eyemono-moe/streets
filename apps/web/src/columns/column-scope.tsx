import { columnMutedDisplay } from "@streets/core/deck/column-kinds";
import type { ColumnDef } from "@streets/core/deck/deck";
import { addKnownRelays } from "@streets/core/deck/known-relays";
import type { NostrEvent } from "@streets/core/nostr/event";
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
  createMemo,
  useContext,
} from "solid-js";
import { setDiagnostics } from "../devtools/diagnostics";
import { useMutes } from "../settings/MuteMediator";
import { columnShowed } from "../telemetry";

/**
 * ブロックが属するカラムについて知ってよいこと。ブロックはカラムの種類を見ず、
 * 見せ方の設定（密度・画像・「表示するもの」など）だけをここから読む。
 */
export type ColumnScopeValue = {
  column: Accessor<ColumnDef>;
  readLayer: ReadLayer;
  partOpen?: (part: string) => boolean;
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

export type BlockSection = Section & {
  /**
   * ミュートに当たる行を `MutedGate` で畳むか。隠すものは `items` から落としてある。
   */
  foldsMuted: Accessor<boolean>;
};

/**
 * ブロックが自分のセクションを作る。診断値を devtools へ出し、状態をカラムへ
 * 知らせる。`name` は 1 カラムに複数のセクションを置くときの見分け。
 *
 * ミュートはカラムの見せ方に従ってここで当てる。ブロックごとに当てると、書き忘れた
 * ところから漏れる。
 */
export const createBlockSection = (options: {
  source: Accessor<NostrSource | undefined>;
  pageSize?: number;
  maxItems?: number;
  pagesNewer?: boolean;
  name?: string;
  /**
   * ミュートを当てない。開いた記事やチャンネルの情報のように、見にきたもの
   * そのものを取るセクションで使う。
   */
  ignoresMutes?: boolean;
  /**
   * 1 行に畳める行か。畳めない行（まとめたリアクションなど）は、「畳む」でも隠す。
   * 省くと、どの行も畳めない。
   */
  canFold?: (event: NostrEvent) => boolean;
}): BlockSection => {
  const scope = useColumnScope();
  const section = createSection({
    manager: scope.readLayer.manager,
    pageSize: options.pageSize,
    maxItems: options.maxItems,
    pagesNewer: options.pagesNewer,
    source: () => addKnownRelays(options.source(), scope.column()),
  });
  const mutes = useMutes();
  const display = () =>
    mutes && !options.ignoresMutes
      ? columnMutedDisplay(scope.column())
      : undefined;
  const items = createMemo(() => {
    const received = section.items();
    const mode = display();
    if (!mutes || mode === undefined || mode === "show") return received;
    const canFold = mode === "fold" ? options.canFold : undefined;
    return received.filter(
      (event) => (canFold?.(event) ?? false) || !mutes.hides(event),
    );
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
  // 重さの計測のため、最初の中身を描き終えたことをカラムの外へ知らせる。
  let shown = false;
  createEffect(() => {
    if (shown || section.items().length === 0) return;
    shown = true;
    const id = scope.column().id;
    requestAnimationFrame(() => setTimeout(() => columnShowed(id)));
  });
  return {
    ...section,
    items,
    foldsMuted: () => display() === "fold" && options.canFold !== undefined,
  };
};
