import type { Message, MessageKey } from "../i18n/message";
import type { RelayUrl } from "../relay/relay-connection";
import {
  type RelayProgress,
  type WriteProgress,
  summarizeRelays,
} from "../write/write-progress";

export type WriteOutcome =
  | { kind: "done" }
  | { kind: "failed"; message: string };

/**
 * 断られた理由。`reason` は分かる理由、`detail` はリレーが添えた説明（分からない理由は
 * それだけ）。どちらも無ければ理由は分からない。
 */
export type Rejection = { reason?: Message; detail?: string };

export type WriteStatus = {
  /** `working` は途中、`saved` は保存できた、`partial` は届かなかったリレーがある。 */
  tone: "working" | "saved" | "partial" | "failed";
  /** 書き込みが投げた失敗は、web が言葉にした文（`WriteOutcome`）をそのまま出す。 */
  text: Message | string;
  /** リレーごとの様子。送る前の段では無い。 */
  relays?: RelayProgress[];
  /** 届かなかったリレーと理由。 */
  failures: { relay: RelayUrl; reason: Rejection }[];
};

/** NIP-01 の OK に付く、機械が読める理由の前置き。 */
const PREFIXES: Record<string, MessageKey> = {
  blocked: "write.rejection.blocked",
  "rate-limited": "write.rejection.rateLimited",
  invalid: "write.rejection.invalid",
  pow: "write.rejection.pow",
  restricted: "write.rejection.restricted",
  "auth-required": "write.rejection.authRequired",
  duplicate: "write.rejection.duplicate",
  error: "write.rejection.error",
};

/**
 * 断られた理由を、Nostr を知らない人にも分かる文にする。リレーが添えた
 * 説明は残す（何を直せばいいかの手がかりになることがある）。
 */
export const describeRejection = (reason: string): Rejection => {
  if (/timed out/.test(reason)) {
    return { reason: { key: "write.rejection.timeout" } };
  }
  if (/socket closed|relay unavailable/.test(reason)) {
    return { reason: { key: "write.rejection.unreachable" } };
  }
  if (/budget exhausted/.test(reason)) {
    return { reason: { key: "write.rejection.budget" } };
  }
  const match = /^([a-z-]+)(?::\s*(.*))?$/.exec(reason);
  const known = match?.[1] ? PREFIXES[match[1]] : undefined;
  if (known) {
    return match?.[2]
      ? { reason: { key: known }, detail: match[2] }
      : { reason: { key: known } };
  }
  return reason ? { detail: reason } : {};
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
    return {
      tone: "working",
      text: { key: "write.status.checking" },
      failures,
    };
  }
  if (progress.phase === "signing") {
    return { tone: "working", text: { key: "write.status.signing" }, failures };
  }
  const summary = summarizeRelays(progress.relays);
  if (!summary.saved) {
    if (summary.finished) {
      return {
        tone: "failed",
        text: { key: "write.status.noneReached" },
        relays,
        failures,
      };
    }
    return {
      tone: "working",
      text: {
        key: "write.status.sending",
        args: { done: summary.total - summary.pending, total: summary.total },
      },
      relays,
      failures,
    };
  }
  if (!summary.finished) {
    return {
      tone: "saved",
      text: {
        key: "write.status.savedSome",
        args: { accepted: summary.accepted },
        count: summary.total,
      },
      relays,
      failures,
    };
  }
  if (summary.rejected > 0) {
    return {
      tone: "partial",
      text: { key: "write.status.partial", count: summary.rejected },
      relays,
      failures,
    };
  }
  return {
    tone: "saved",
    text: { key: "write.status.saved" },
    relays,
    failures,
  };
};
