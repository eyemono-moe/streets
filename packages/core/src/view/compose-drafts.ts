import * as v from "valibot";
import { type NostrEvent, isNostrEvent } from "../nostr/event";

/**
 * 投稿の下書き。端末の中にだけ置く —— 書きかけをリレーへ出さないため。
 * 添えたファイルは残さない（送るまでアップロードしないので、残すなら File ごと
 * 端末に置く仕組みが要る）。
 */
export const COMPOSE_DRAFTS_STORAGE_KEY = "streets.v1.composeDrafts";

/** 閉じたときに自動で残す下書きは、新しいものからこの件数まで。 */
export const AUTO_DRAFT_LIMIT = 5;

const targetSchema = v.object({
  type: v.picklist(["reply", "quote"]),
  /**
   * 宛先の投稿そのもの。開き直すときにリレーから取り直さずに済み、取れなくなった投稿へも
   * 送り直せる。
   */
  event: v.custom<NostrEvent>(isNostrEvent),
});

/** 返信・引用の下書きが向いている投稿。新しい投稿の下書きには無い。 */
export type ComposeTarget = v.InferOutput<typeof targetSchema>;

const draftSchema = v.object({
  id: v.string(),
  content: v.string(),
  contentWarning: v.optional(v.string()),
  /** 最後に残した時刻（ミリ秒）。 */
  savedAt: v.number(),
  /** 自分で「下書きに入れる」を押したもの。自動のものと違い、件数で消さない。 */
  kept: v.boolean(),
  target: v.optional(targetSchema),
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

/** 同じ投稿へ同じ形（返信・引用）で書いた下書きのうち、いちばん新しいもの。 */
export const draftFor = (
  drafts: readonly ComposeDraft[],
  target: ComposeTarget,
): ComposeDraft | undefined =>
  drafts
    .filter(
      (draft) =>
        draft.target?.type === target.type &&
        draft.target.event.id === target.event.id,
    )
    .reduce<ComposeDraft | undefined>(
      (newest, draft) =>
        newest === undefined || draft.savedAt > newest.savedAt ? draft : newest,
      undefined,
    );

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
