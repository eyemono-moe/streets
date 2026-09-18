/** 最後に自分が把握している、リレー上の版。 */
export type KnownVersion = { id: string; createdAt: number } | undefined;

/**
 * 置換の直前に引いた版を「別の端末の変更」として扱うか。
 *
 * 自分が書いた版や、把握している版より古い版（まだ追いついていないリレーの取り残し）を
 * 別の端末の変更と見なすと、自分で変えただけなのに「どちらを残しますか？」を出してしまう。
 */
export const isRemoteChange = (
  current: { id: string; created_at: number } | undefined,
  known: KnownVersion,
  published: ReadonlySet<string>,
): boolean => {
  // 消えていたら、手元の版で復旧してよい。
  if (!current) return false;
  if (known && current.id === known.id) return false;
  if (published.has(current.id)) return false;
  if (known && current.created_at < known.createdAt) return false;
  return true;
};
