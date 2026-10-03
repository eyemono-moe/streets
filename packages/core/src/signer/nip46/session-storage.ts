import * as v from "valibot";
import { normalizeRelayUrl } from "../../relay/relay-url";
import { MAX_NIP46_RELAYS } from "./bunker-uri";

export const NIP46_SESSION_STORAGE_KEY = "streets.v1.nip46-session";
// Streets が署名器に依頼するイベント。リレーへの投稿以外に、Zap・認証も含む。
const SIGN_EVENT_KINDS = [
  0, 1, 3, 5, 6, 7, 40, 41, 42, 43, 44, 1018, 1111, 9734, 10000, 10001, 10002,
  10003, 10005, 10006, 10007, 10030, 10063, 22242, 24242, 30078, 30315,
] as const;

export const NIP46_REQUIRED_PERMISSIONS = [
  ...SIGN_EVENT_KINDS.map((kind) => `sign_event:${kind}`),
  "nip44_encrypt",
  "nip44_decrypt",
  "nip04_decrypt",
].join(",");

const hex64 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));
const sessionSchema = v.strictObject({
  // v3 は現在必要な権限文字列そのものを保存し、version だけ上げ忘れて権限不足の session を復元する事故を literal 照合で防ぐ。
  version: v.literal(3),
  permissions: v.literal(NIP46_REQUIRED_PERMISSIONS),
  clientSecret: hex64,
  remoteSignerPubkey: hex64,
  userPubkey: hex64,
  relays: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5)),
});

export type StoredNip46SessionV3 = v.InferOutput<typeof sessionSchema>;

export const loadNip46Session = (
  raw: string | null,
): StoredNip46SessionV3 | undefined => {
  if (raw === null) return undefined;
  try {
    const parsed = v.parse(sessionSchema, JSON.parse(raw));
    const relays = parsed.relays.map(normalizeRelayUrl);
    if (
      relays.some((relay) => relay === undefined) ||
      new Set(relays).size !== relays.length ||
      relays.length > MAX_NIP46_RELAYS
    ) {
      return undefined;
    }
    return { ...parsed, relays: relays as string[] };
  } catch {
    return undefined;
  }
};

export const saveNip46Session = (session: StoredNip46SessionV3): string =>
  JSON.stringify(v.parse(sessionSchema, session));
