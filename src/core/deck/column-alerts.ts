import type { SectionStatus } from "../read/source";
import {
  type RelayListState,
  readRelayCount,
} from "../settings/relay-list-state";
import type { ColumnDef } from "./deck";

export type ColumnAlert = {
  /** ヘッダのアイコンを押したときに出る一行 */
  message: string;
  /** ユーザーが取れる行動 */
  action: string;
};

/**
 * カラムに起きたことのうち、ユーザーが行動できるものだけを返す (診断値
 * は含めない)。判定はここに集約し、複数の警告を同時に返しうるため配列。
 */
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
  relayList: RelayListState,
): ColumnAlert[] => {
  const alerts: ColumnAlert[] = [];
  const source = column.source;
  const unreachable = status.incomplete?.unreachableRelays ?? 0;

  // ユーザーが指定した URL だけが対象 —— Outbox が選んだリレーはユーザーには変えられない。
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

  // phase で区別しないと、起動直後は常に 0 本なので loading 中も「設定が無い」が一瞬表示される。
  const viewerRelayListMissing =
    (relayList.phase === "missing" || relayList.phase === "ready") &&
    readRelayCount(relayList) === 0;

  // 通知が来ない原因 (無反応 or リレー未設定) は画面から区別できないので、kind:10002 が無ければ知らせる。
  if (source.kind === "notifications" && viewerRelayListMissing) {
    alerts.push({
      // missing は取得 timeout も含む (未確定なだけ) ので、publish 済みの人にも意味が通る文言にする。
      message:
        "あなたのリレー設定 (kind:10002) が見つからないか取得できなかったため、既定のリレーで待っています",
      action:
        "通知が届かない場合は、リレー設定を publish しているか確認してください",
    });
  }

  // kind:10002 は引けていても read リレーが全滅なら、`literal` 列と同じ理由で知らせる。
  if (
    source.kind === "notifications" &&
    !viewerRelayListMissing &&
    relayList.phase === "ready" &&
    unreachable > 0
  ) {
    alerts.push({
      message: `あなたの設定した read リレーに接続できません (${unreachable} 本)`,
      action: "リレー設定 (kind:10002) の read リレーを確認してください",
    });
  }

  return alerts;
};
