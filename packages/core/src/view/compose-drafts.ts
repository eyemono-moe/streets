import * as v from "valibot";

/**
 * 投稿の下書き。端末の中にだけ置く —— 書きかけをリレーへ出さないため。
 * 添えたファイルは残さない（送るまでアップロードしないので、残すなら File ごと
 * 端末に置く仕組みが要る）。
 */
export const COMPOSE_DRAFTS_STORAGE_KEY = "streets.v1.composeDrafts";

/** 閉じたときに自動で残す下書きは、新しいものからこの件数まで。 */
export const AUTO_DRAFT_LIMIT = 5;

const draftSchema = v.object({
  id: v.string(),
  content: v.string(),
  contentWarning: v.optional(v.string()),
  /** 最後に残した時刻（ミリ秒）。 */
  savedAt: v.number(),
  /** 自分で「下書きに入れる」を押したもの。自動のものと違い、件数で消さない。 */
  kept: v.boolean(),
});

export type ComposeDraft = v.InferOutput<typeof draftSchema>;

/** 残す中身が無い。閲覧注意だけを付けた書きかけも残さない。 */
export const isBlankDraft = (content: string): boolean =>
  content.trim().length === 0;

/**
 * 同じ id のものを差し替え、新しい順に並べる。自動で残したものは
 * `AUTO_DRAFT_LIMIT` 件を超えた古いものから消す。
 */
export const putDraft = (
  drafts: readonly ComposeDraft[],
  draft: ComposeDraft,
): ComposeDraft[] => {
  const sorted = [draft, ...drafts.filter((other) => other.id !== draft.id)]
    .map((other) => ({ ...other }))
    .sort((a, b) => b.savedAt - a.savedAt);
  let auto = 0;
  return sorted.filter((other) => other.kept || ++auto <= AUTO_DRAFT_LIMIT);
};

export const removeDraft = (
  drafts: readonly ComposeDraft[],
  id: string,
): ComposeDraft[] =>
  drafts.filter((draft) => draft.id !== id).map((draft) => ({ ...draft }));

/** 読めないものは捨てる。1 件壊れていても、ほかの下書きは残す。 */
export const loadComposeDrafts = (raw: string | null): ComposeDraft[] => {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .flatMap((entry) => {
      const result = v.safeParse(draftSchema, entry);
      return result.success ? [result.output] : [];
    })
    .sort((a, b) => b.savedAt - a.savedAt);
};

export const saveComposeDrafts = (drafts: readonly ComposeDraft[]): string =>
  JSON.stringify(drafts);
