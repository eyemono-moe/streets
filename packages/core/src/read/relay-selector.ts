import type { RelayUrl } from "../relay/relay-connection";

export type Selection = {
  /** 開くべきリレー。pinned を含む。長さ <= budget */
  readonly picks: readonly RelayUrl[];
  /**
   * 著者 → 購読するリレー。demand の全著者が入る。**空配列になる理由は 2 つ** —
   * 接続予算で落ちた場合と、宣言リレーが全部 `degraded` だった場合。
   */
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
  /**
   * 連続して開けなかったリレー。候補から外す (割り当てても被覆は増えず
   * 枠だけ埋まる)。`pinned` には適用しない —— 黙って落とすと経路が壊れる。
   */
  degraded?: readonly RelayUrl[];
};

/**
 * 予算内で開くリレー集合を決める純関数 (冗長度つき貪欲集合被覆)。残り必要
 * 本数は `min(redundancy, 宣言本数)` で初期化する (1 本しか宣言してない著者
 * は届かないため) —— 今日の出力には影響しないが将来の重み付けのため正しい
 * 値を保つ。
 */
export const selectRelays = ({
  demand,
  pinned,
  current,
  budget,
  redundancy,
  degraded,
}: SelectRelaysOptions): Selection => {
  const degradedSet = new Set(degraded ?? []);

  // リレー → そのリレーを宣言している著者。degraded な URL はここに入れない
  // — pinned はこのマップを経由しないので影響を受けない。
  const relayToAuthors = new Map<RelayUrl, Set<string>>();
  for (const [pubkey, urls] of demand) {
    for (const url of urls) {
      if (degradedSet.has(url)) continue;
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
