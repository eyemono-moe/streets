import * as v from "valibot";
import { normalizeRelayUrl } from "../../relay/relay-url";
import { MAX_NIP46_RELAYS } from "./bunker-uri";

export const NIP46_SESSION_STORAGE_KEY = "streets.v1.nip46-session";
// Streets が署名器に依頼するイベント。リレーへの投稿以外に、Zap・認証も含む。
const SIGN_EVENT_KINDS = [
  0, 1, 3, 5, 6, 7, 40, 41, 42, 43, 44, 1018, 1111, 9734, 10000, 10001, 10002,
  10003, 10005, 10006, 10007, 10030, 10063, 10096, 22242, 24242, 27235, 30000,
  30078, 30315,
] as const;

export const NIP46_REQUIRED_PERMISSIONS = [
  ...SIGN_EVENT_KINDS.map((kind) => `sign_event:${kind}`),
  "nip44_encrypt",
  "nip44_decrypt",
  "nip04_decrypt",
].join(",");

/** 接続したときに署名器へ求めた権限に、その kind の署名が入っていたか。 */
export const grantsSignEvent = (permissions: string, kind: number): boolean =>
  permissions.split(",").includes(`sign_event:${kind}`);

/** 書き込み経路を足したとき、接続時の要求権限を増やし忘れたことを検出する。 */
export const assertNip46SignPermission = (kind: number): void => {
  if (!grantsSignEvent(NIP46_REQUIRED_PERMISSIONS, kind)) {
    throw new Error(`missing NIP-46 permission: sign_event:${kind}`);
  }
};

const hex64 = v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/));
const sessionSchema = v.strictObject({
  version: v.literal(3),
  // 接続したときに求めた権限。いまの要求と違っても捨てない。捨てると kind を
  // 1 つ足すたびに全員が繋ぎ直しになる。多くの署名器は求めていない種類も
  // その場で聞くので、断られたときだけ繋ぎ直しを案内する。
  permissions: v.string(),
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
    return parseNip46Session(JSON.parse(raw));
  } catch {
    return undefined;
  }
};

export const parseNip46Session = (
  value: unknown,
): StoredNip46SessionV3 | undefined => {
  try {
    const parsed = v.parse(sessionSchema, value);
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
