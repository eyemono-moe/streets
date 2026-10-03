import handler from "../streets-handler.json";
import type { EventDraft } from "./draft";

/** NIP-89 のアプリの説明（kind:31990）。 */
export const APP_HANDLER_KIND = 31990;

/**
 * Streets を説明する kind:31990 を指す `client` タグ。そのイベントはリリースの
 * ワークフローが `streets-handler.json` から作って出す（scripts/app-handler.mjs）。
 */
export const STREETS_CLIENT_TAG: readonly string[] = [
  "client",
  handler.metadata.name,
  `${APP_HANDLER_KIND}:${handler.pubkey}:${handler.identifier}`,
  handler.relay,
];

/** 付けるのは人が書いた公開の投稿だけ。リアクションやリストには付けない。 */
const TAGGED_KINDS = new Set([1, 42, 1111]);

/** どのアプリから投稿したかを示す `client` タグ（NIP-89）を付ける。 */
export const withClientTag = (draft: EventDraft): EventDraft => {
  if (!TAGGED_KINDS.has(draft.kind)) return draft;
  if (draft.tags.some((tag) => tag[0] === "client")) return draft;
  return { ...draft, tags: [...draft.tags, [...STREETS_CLIENT_TAG]] };
};
