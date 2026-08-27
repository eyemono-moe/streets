import * as v from "valibot";
import { normalizeRelayUrl } from "../../relay/relay-url";
import { MAX_NIP46_RELAYS } from "./bunker-uri";

export const NIP46_SESSION_STORAGE_KEY = "streets.v1.nip46-session";

const hex64 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));
const sessionSchema = v.strictObject({
  // v2 は kind:10000 と NIP-44/NIP-04 の権限を connect 時に承認済みの
  // セッションだけを表す。v1 を復元すると ping は通ってもミュート操作が
  // 拒否されるため、互換扱いせず新しい bunker URI で再承認してもらう。
  version: v.literal(2),
  clientSecret: hex64,
  remoteSignerPubkey: hex64,
  userPubkey: hex64,
  relays: v.pipe(v.array(v.string()), v.minLength(1), v.maxLength(5)),
});

export type StoredNip46SessionV2 = v.InferOutput<typeof sessionSchema>;

export const loadNip46Session = (
  raw: string | null,
): StoredNip46SessionV2 | undefined => {
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

export const saveNip46Session = (session: StoredNip46SessionV2): string =>
  JSON.stringify(v.parse(sessionSchema, session));
