/**
 * NIP-56 の通報（kind:1984）。
 *
 * - 通報する人を `p` に入れる（"The report event MUST include a `p` tag referencing the
 *   pubkey of the user you are reporting"）
 * - 投稿を通報するときは `e` も入れる（"If reporting a note, an `e` tag MUST also be included
 *   referencing the note id"）
 * - 通報の種類は、通報する対象のタグの 3 番目に置く（"A `report type` string MUST be included
 *   as the 3rd entry to the `e`, `p` or `x` tag being reported"）。投稿の通報では `e` に置き、
 *   `p` には置かない（NIP-56 の例 `["e", "<eventId>", "illegal"], ["p", "<pubkey>"]`）
 * - `content` には補足を書いてよい（"The `content` MAY contain additional information"）
 */
import type { EventDraft } from "./build/draft";

export const REPORT_KIND = 1984;

export const REPORT_REASONS = [
  "nudity",
  "malware",
  "profanity",
  "illegal",
  "spam",
  "impersonation",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const isReportReason = (value: unknown): value is ReportReason =>
  typeof value === "string" &&
  (REPORT_REASONS as readonly string[]).includes(value);

export type ReportTarget =
  | { type: "pubkey"; pubkey: string }
  | { type: "event"; id: string; pubkey: string };

export const buildReport = (
  target: ReportTarget,
  reason: ReportReason,
  text: string,
): EventDraft => ({
  kind: REPORT_KIND,
  tags:
    target.type === "pubkey"
      ? [["p", target.pubkey, reason]]
      : [
          ["e", target.id, reason],
          ["p", target.pubkey],
        ],
  content: text,
});
