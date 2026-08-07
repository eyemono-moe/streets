import type { SectionStatus } from "../read/source";
import type { ColumnDef } from "./deck";

export type ColumnAlert = {
  /** ヘッダのアイコンを押したときに出る一行 */
  message: string;
  /** ユーザーが取れる行動 */
  action: string;
};

/**
 * カラムに起きたことのうち、**ユーザーが行動できるものだけ**を返す
 * (ADR-0026)。行動できない値 (`uncoveredAuthors` など) は診断値であり、
 * 開発者モードの背後で生の数値として出す —— ここには入れない。
 *
 * 判定をこの 1 関数に集めるのは、カラムの実装に散らすと「この条件は
 * 行動できるのか」という判断が UI のあちこちで独立に下されるようになる
 * ため。ADR-0026 はその判断そのものを決定として記録している。
 *
 * 今は 1 種類しか返さないが、返り値を配列にしてあるのは、A-2 以降で
 * レンダラの失敗や未知の kind が同じ入口へ集まるため。
 */
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
): ColumnAlert[] => {
  const alerts: ColumnAlert[] = [];
  const source = column.source;
  const unreachable = status.incomplete?.unreachableRelays ?? 0;

  // ユーザーが自分で URL を指定したカラムだけが対象。Outbox が選んだ
  // リレーが落ちている場合、ユーザーには変える手立てが無い。
  if (
    source.kind === "literal" &&
    source.relays !== undefined &&
    unreachable > 0
  ) {
    alerts.push({
      message: `指定したリレーに接続できません (${unreachable} 本)`,
      action: "カラムの設定でリレーの URL を確認してください",
    });
  }

  return alerts;
};
