/** 16 進 64 桁だけを pubkey として扱う。リレー由来の tag には何が入っていてもおかしくない。 */
const PUBKEY_PATTERN = /^[0-9a-f]{64}$/;

/**
 * kind:3 が指しているフォロー先。NIP-02 の順序（追加順）は保つが、
 * 同じ pubkey が 2 回書かれていることはあるので重複は落とす。
 */
export const followeesFrom = (
  event: { tags: readonly (readonly string[])[] } | undefined,
): readonly string[] => {
  const unique = new Set<string>();
  for (const tag of event?.tags ?? []) {
    const pubkey = tag[0] === "p" ? tag[1] : undefined;
    if (pubkey && PUBKEY_PATTERN.test(pubkey)) unique.add(pubkey);
  }
  return [...unique];
};

/**
 * その人を指している kind:3 の書き手。取得できたぶんしか数えられないので、
 * 画面では「これ以上いる」ことが分かるように出す。
 */
export const followersFrom = (
  events: readonly { pubkey: string }[],
): readonly string[] => [...new Set(events.map((event) => event.pubkey))];

/**
 * その kind:3 の書き手が `pubkey` をフォローしているか。kind:3 がまだ無い
 * （取得中・公開していない）ときは分からないので false とせず undefined を返す。
 */
export const followsPubkey = (
  event: { tags: readonly (readonly string[])[] } | undefined,
  pubkey: string,
): boolean | undefined =>
  event === undefined
    ? undefined
    : event.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey);
