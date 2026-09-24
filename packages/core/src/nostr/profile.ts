import * as v from "valibot";
import { encodeBech32 } from "./nip19";

// 1 項目の型違いで他の項目まで捨てないよう、項目ごとに不正値を undefined へ落とす。
const optionalText = v.fallback(v.optional(v.string()), undefined);

const profileSchema = v.looseObject({
  name: optionalText,
  display_name: optionalText,
  picture: optionalText,
  about: optionalText,
  banner: optionalText,
  nip05: optionalText,
});

export type Profile = {
  name?: string;
  displayName?: string;
  picture?: string;
  /** 自己紹介。ユーザー詳細でだけ出す。 */
  about?: string;
  /** ヘッダー画像。 */
  banner?: string;
  /** ドメインでの本人確認（NIP-05）。書いてあるだけで、確かめてはいない。 */
  nip05?: string;
};

const nonBlank = (value: string | undefined): string | undefined =>
  value !== undefined && value.trim().length > 0 ? value : undefined;

/** kind:0 の `content` を読む。リレー由来で形を保証されないので、壊れていても例外を投げない。 */
export const parseProfile = (content: string): Profile | undefined => {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return undefined;
  }
  const result = v.safeParse(profileSchema, json);
  if (!result.success) return undefined;
  return {
    name: nonBlank(result.output.name),
    displayName: nonBlank(result.output.display_name),
    picture: nonBlank(result.output.picture),
    about: nonBlank(result.output.about),
    banner: nonBlank(result.output.banner),
    nip05: nonBlank(result.output.nip05),
  };
};

/** pubkey はリレー由来の任意文字列でありうる。bech32 化が投げても画面を落とさない。 */
export const shortNpub = (pubkey: string): string => {
  try {
    return encodeBech32("npub", pubkey).slice(0, 12);
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
};

/** その人を 1 語で指すときの名前。 */
export const profileLabel = (
  profile: Profile | undefined,
  pubkey: string,
): string => profile?.displayName ?? profile?.name ?? shortNpub(pubkey);
