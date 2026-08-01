import type { RelayUrl } from "../relay/relay-connection";

export type Selection = {
  /** 開くべきリレー。pinned を含む。長さ <= budget */
  readonly picks: readonly RelayUrl[];
  /** 著者 → 購読するリレー。demand の全著者が入る (空配列 = 予算切れ) */
  readonly assignment: ReadonlyMap<string, readonly RelayUrl[]>;
  /** 1 本も確保できなかった著者 */
  readonly uncovered: readonly string[];
};

export type SelectRelaysOptions = {
  /** 著者 → その著者が宣言した write リレー全部 (切り捨てなし) */
  demand: ReadonlyMap<string, readonly RelayUrl[]>;
  /** 明示指定・fallback・インデクサ。予算を消費するが決して落とさない */
  pinned: readonly RelayUrl[];
  /** いま開いているリレー。同点時に優先して churn を減らす */
  current: readonly RelayUrl[];
  budget: number;
  redundancy: number;
};

/**
 * 予算内で開くリレー集合を決める (ADR-0025)。純関数。
 *
 * 冗長度つきの貪欲集合被覆。各著者の残り必要本数は
 * **min(redundancy, 宣言本数)** で初期化する — 本当の目標値はこれであり、
 * write リレーを 1 本しか宣言していない著者は原理的に冗長度 2 に到達
 * できない。
 *
 * ただし**この min は現状の選定結果 (picks / assignment / uncovered) を
 * 変えない**。`gain` は「need > 0 の著者数」を数えるブール的な指標であり、
 * 宣言本数分すべて選ばれ終えるまでは min ありでも redundancy 初期化でも
 * need は同じ回数だけ正になる。全部選ばれ終えた後は当該著者の残り需要が
 * 0 になるかどうかが違うだけで、そのときにはその著者の宣言リレーは
 * すべて candidates から既に消えているので、他候補の gain に影響しない。
 * min が変えるのは「何人が目標冗長度に達したか」という**充足率の計測**
 * (docs/research/2026-08-01-outbox-connection-budget.md) であって、
 * この関数の出力ではない。`gain` が将来ブール数え上げでなく
 * 「回復する冗長度の大きさ」で重み付けされるようになれば、min は
 * 選定そのものに効くようになる — そのときのために正しい値を保持する。
 *
 * 粘着性は**同点のときだけ**効く。既に開いているリレーを優先することで
 * カラム追加のたびに 30 接続を張り直す churn を避けるが、被覆を犠牲に
 * してまで維持はしない。
 */
export const selectRelays = ({
  demand,
  pinned,
  current,
  budget,
  redundancy,
}: SelectRelaysOptions): Selection => {
  // リレー → そのリレーを宣言している著者
  const relayToAuthors = new Map<RelayUrl, Set<string>>();
  for (const [pubkey, urls] of demand) {
    for (const url of urls) {
      const authors = relayToAuthors.get(url);
      if (authors) authors.add(pubkey);
      else relayToAuthors.set(url, new Set([pubkey]));
    }
  }

  const need = new Map<string, number>();
  for (const [pubkey, urls] of demand) {
    need.set(pubkey, Math.min(redundancy, urls.length));
  }

  const picks: RelayUrl[] = [];
  const picked = new Set<RelayUrl>();
  const take = (url: RelayUrl) => {
    picks.push(url);
    picked.add(url);
    for (const pubkey of relayToAuthors.get(url) ?? []) {
      const remaining = need.get(pubkey);
      if (remaining !== undefined && remaining > 0) {
        need.set(pubkey, remaining - 1);
      }
    }
  };

  // pinned が先。予算を食うが決して落とさない
  for (const url of pinned) {
    if (picked.has(url)) continue;
    if (picks.length >= budget) break;
    take(url);
  }

  const currentSet = new Set(current);
  const candidates = new Map(relayToAuthors);
  for (const url of picked) candidates.delete(url);

  while (picks.length < budget) {
    let best: RelayUrl | undefined;
    let bestGain = 0;
    let bestIsCurrent = false;

    for (const [url, authors] of candidates) {
      let gain = 0;
      for (const pubkey of authors) {
        if ((need.get(pubkey) ?? 0) > 0) gain += 1;
      }
      if (gain === 0) continue;

      const isCurrent = currentSet.has(url);
      const better =
        gain > bestGain ||
        // 同点なら既に開いているものを優先する (churn を減らす)
        (gain === bestGain && isCurrent && !bestIsCurrent) ||
        // それも同じなら辞書順。同じ入力が常に同じ出力になるように
        (gain === bestGain &&
          isCurrent === bestIsCurrent &&
          best !== undefined &&
          url < best);

      if (better) {
        best = url;
        bestGain = gain;
        bestIsCurrent = isCurrent;
      }
    }

    if (best === undefined) break;
    take(best);
    candidates.delete(best);
  }

  const assignment = new Map<string, readonly RelayUrl[]>();
  const uncovered: string[] = [];
  for (const [pubkey, urls] of demand) {
    const assigned = urls.filter((url) => picked.has(url)).slice(0, redundancy);
    assignment.set(pubkey, assigned);
    if (assigned.length === 0) uncovered.push(pubkey);
  }

  return { picks, assignment, uncovered };
};
