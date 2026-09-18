import type { RelayUrl } from "../relay/relay-connection";
import {
  type RelayProgress,
  type WriteProgress,
  summarizeRelays,
} from "../write/write-progress";

export type WriteOutcome =
  | { kind: "done" }
  | { kind: "failed"; message: string };

export type WriteStatus = {
  /** `working` は途中、`saved` は保存できた、`partial` は届かなかったリレーがある。 */
  tone: "working" | "saved" | "partial" | "failed";
  text: string;
  /** リレーごとの様子。送る前の段では無い。 */
  relays?: RelayProgress[];
  /** 届かなかったリレーと理由。 */
  failures: { relay: RelayUrl; reason: string }[];
};

/** NIP-01 の OK に付く、機械が読める理由の前置き。 */
const PREFIXES: Record<string, string> = {
  blocked: "このリレーに断られました",
  "rate-limited": "短い間に送りすぎて断られました",
  invalid: "このリレーが受け付けない形でした",
  pow: "このリレーが求める計算（PoW）が足りませんでした",
  restricted: "このリレーには書き込めません",
  "auth-required": "このリレーはログイン（認証）が必要です",
  duplicate: "同じものがもう届いていました",
  error: "リレーの中でエラーが起きました",
};

/**
 * 断られた理由を、Nostr を知らない人にも分かる文にする。リレーが添えた
 * 説明は括弧で残す（何を直せばいいかの手がかりになることがある）。
 */
export const describeRejection = (reason: string): string => {
  if (/timed out/.test(reason)) return "時間内に応答がありませんでした";
  if (/socket closed|relay unavailable/.test(reason)) {
    return "つながりませんでした";
  }
  if (/budget exhausted/.test(reason)) {
    return "同時につなげる数の上限に達していました";
  }
  const match = /^([a-z-]+):\s*(.*)$/.exec(reason);
  const known = match?.[1] ? PREFIXES[match[1]] : undefined;
  if (known) return match?.[2] ? `${known}（${match[2]}）` : known;
  return reason || "理由は分かりません";
};

const failuresOf = (progress: WriteProgress | undefined) =>
  progress?.phase === "sending"
    ? progress.relays.flatMap((entry) =>
        entry.state === "rejected"
          ? [
              {
                relay: entry.relay,
                reason: describeRejection(entry.reason ?? ""),
              },
            ]
          : [],
      )
    : [];

/**
 * 書き込みの進み具合を、知らせる文にする。1 本でも受け取ったら「保存しました」と
 * 言う —— 書いたものはもうどこかに残っていて、残りを待たせる理由が無い。
 */
export const writeStatus = (
  progress: WriteProgress | undefined,
  outcome?: WriteOutcome,
): WriteStatus => {
  const relays = progress?.phase === "sending" ? progress.relays : undefined;
  const failures = failuresOf(progress);
  if (outcome?.kind === "failed") {
    return { tone: "failed", text: outcome.message, relays, failures };
  }
  if (!progress || progress.phase === "checking") {
    return { tone: "working", text: "最新の状態を確認しています", failures };
  }
  if (progress.phase === "signing") {
    return { tone: "working", text: "署名を待っています", failures };
  }
  const summary = summarizeRelays(progress.relays);
  if (!summary.saved) {
    if (summary.finished) {
      return {
        tone: "failed",
        text: "どのリレーにも届きませんでした",
        relays,
        failures,
      };
    }
    return {
      tone: "working",
      text: `送信しています（${summary.total - summary.pending}/${summary.total}）`,
      relays,
      failures,
    };
  }
  if (!summary.finished) {
    return {
      tone: "saved",
      text: `保存しました（${summary.accepted}/${summary.total} 件のリレー）`,
      relays,
      failures,
    };
  }
  if (summary.rejected > 0) {
    return {
      tone: "partial",
      text: `保存しました。${summary.rejected} 件のリレーには届きませんでした`,
      relays,
      failures,
    };
  }
  return { tone: "saved", text: "保存しました", relays, failures };
};
