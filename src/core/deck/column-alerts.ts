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
 * カラムに起きたことのうち、**ユーザーが行動できるものだけ**を返す
 * (ADR-0026)。行動できない値 (`uncoveredAuthors` など) は診断値であり、
 * 開発者モードの背後で生の数値として出す —— ここには入れない。
 *
 * 判定をこの 1 関数に集めるのは、カラムの実装に散らすと「この条件は
 * 行動できるのか」という判断が UI のあちこちで独立に下されるようになる
 * ため。ADR-0026 はその判断そのものを決定として記録している。
 *
 * 返り値を配列にしてあるのは、A-2 以降でレンダラの失敗や未知の kind が
 * 同じ入口へ集まるため。通知列は既に 2 種類 (リレー設定が見つからない/
 * 取得できない、read リレーが到達不能) を同時に返しうる。
 */
export const columnAlerts = (
  column: ColumnDef,
  status: SectionStatus,
  relayList: RelayListState,
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

  // read リレー 0 本が「設定が無い」のか「まだ届いていない」のかは
  // RelayListState の phase で区別する。loading 中にこの判定を出すと、
  // 起動直後は必ず 0 本なので「リレー設定が見つからない」が毎回一瞬光って
  // 消える —— まだ存在しない劣化を確定した事実として見せることになる。
  const viewerRelayListMissing =
    (relayList.phase === "missing" || relayList.phase === "ready") &&
    readRelayCount(relayList) === 0;

  // 通知は「届いていないこと」に気づきにくい —— 誰も反応していないのか、
  // 見る場所が違うのか、画面からは区別が付かない。自分の kind:10002 が
  // 無いと fallback の 3 本を見ることになるので、そこは黙らせない
  // (ADR-0011)。リレー設定の publish はユーザーが取れる行動なので
  // ADR-0026 の条件も満たす。
  if (source.kind === "notifications" && viewerRelayListMissing) {
    alerts.push({
      // `viewerRelayListMissing` は「設定が無い」だけでなく kind:10002 の
      // 取得が timeout したケースも含む (settle した = 待つのをやめた、で
      // あって「無いと確定した」ではない)。既に publish 済みの利用者に
      // 「publish しているか確認してください」とだけ出すのは、取れない
      // 行動を指示することになる。
      message:
        "あなたのリレー設定 (kind:10002) が見つからないか取得できなかったため、既定のリレーで待っています",
      action:
        "通知が届かない場合は、リレー設定を publish しているか確認してください",
    });
  }

  // 通知カラムの read リレー (inbox) が到達不能でも、上の
  // `viewerRelayListMissing` は真にならない (kind:10002 自体は引けている)。
  // それでも画面から見える結果 (通知が来ない) も取れる行動 (リレー設定を
  // 直す) も設定が無い場合と同じなので、`literal` 列と同じ理由で黙らせない。
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
