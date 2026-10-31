/*
 * アップレットに頼まれて書き込むもの（NAP-RELAY の `relay.publish`・`relay.publishEncrypted`、
 * NAP-OUTBOX の `outbox.publish`）の確かめ方。署名するのは Streets で、アップレットは
 * 鍵に触れない。何を書くかは毎回ユーザーに見せて確かめる。
 */
import type { EventDraft } from "../nostr/build/draft";

export type PublishOperation = "publish" | "publishEncrypted";

const MAX_CONTENT_LENGTH = 64 * 1024;
const MAX_TAGS = 2000;

/**
 * 頼まれても署名しない kind。どれも、ユーザーとしてほかのサーバーやリレーに名乗る
 * ためのもの（認証）で、アップレットが手にすると本人になりすませる。
 */
const REFUSED_KINDS: ReadonlySet<number> = new Set([
  // NIP-42 のリレーへの認証
  22242,
  // NIP-46 の署名器とのやりとり
  24133,
  // Blossom（BUD-01）のアップロードの認証
  24242,
  // NIP-98 の HTTP の認証
  27235,
]);

/**
 * 暗号文を運ぶ kind。暗号化は Streets がする（`publishEncrypted`）。アップレットが
 * 作った暗号文に署名すると、中身を見せて確かめられない。
 */
const CIPHERTEXT_KINDS: ReadonlySet<number> = new Set([4, 13, 1059, 1060]);

const isReplaceable = (kind: number) =>
  kind === 0 ||
  kind === 3 ||
  (kind >= 10_000 && kind < 20_000) ||
  (kind >= 30_000 && kind < 40_000);

/**
 * 書くと、いまある設定やリストを置き換える・消すもの。「今後は確認しない」を出さず、
 * 毎回確かめる。
 */
export const overwritesState = (kind: number): boolean =>
  isReplaceable(kind) || kind === 5;

/** 確かめた後、同じアップレットの同じ書き込みを、次から確かめずに通してよいか。 */
export const rememberable = (kind: number): boolean => !overwritesState(kind);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 頼まれたイベントを、署名に回せる下書きにする。`created_at`・`pubkey`・`id`・`sig` は
 * 受け取らない（Streets が決める）。
 */
export const parsePublishTemplate = (
  raw: unknown,
  operation: PublishOperation,
): { ok: true; draft: EventDraft } | { ok: false; error: string } => {
  if (!isRecord(raw)) return { ok: false, error: "invalid event" };
  const { kind, content, tags } = raw;
  if (
    typeof kind !== "number" ||
    !Number.isInteger(kind) ||
    kind < 0 ||
    kind > 65_535
  ) {
    return { ok: false, error: "invalid kind" };
  }
  if (typeof content !== "string" || content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, error: "invalid content" };
  }
  const list = tags ?? [];
  if (
    !Array.isArray(list) ||
    list.length > MAX_TAGS ||
    !list.every(
      (tag) =>
        Array.isArray(tag) &&
        tag.length > 0 &&
        tag.every((value) => typeof value === "string"),
    )
  ) {
    return { ok: false, error: "invalid tags" };
  }
  if (REFUSED_KINDS.has(kind)) {
    return {
      ok: false,
      error: `denied: this shell does not sign kind ${kind}`,
    };
  }
  if (operation === "publish" && CIPHERTEXT_KINDS.has(kind)) {
    return {
      ok: false,
      error: `denied: kind ${kind} carries ciphertext; use publishEncrypted`,
    };
  }
  return {
    ok: true,
    draft: { kind, content, tags: (list as string[][]).map((tag) => [...tag]) },
  };
};

/** アップロード（NAP-UPLOAD）を確かめずに通すと許したことを覚える鍵。 */
export const UPLOAD_GRANT = "upload";

/** 知らせ（NAP-NOTIFY）を出してよいと許したことを覚える鍵。 */
export const NOTIFY_GRANT = "notify";

/** 「今後は確認しない」を覚える鍵。アップレットごと・書き方と kind ごと。 */
export const grantKey = (operation: PublishOperation, kind: number): string =>
  `${operation}:${kind}`;

export const parseGrantKey = (
  key: string,
): { operation: PublishOperation; kind: number } | undefined => {
  const match = /^(publish|publishEncrypted):(\d+)$/.exec(key);
  return match
    ? {
        operation: match[1] as PublishOperation,
        kind: Number(match[2]),
      }
    : undefined;
};
