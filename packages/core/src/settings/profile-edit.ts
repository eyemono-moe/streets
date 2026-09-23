import * as v from "valibot";
import type { Profile } from "../nostr/profile";

/**
 * プロフィール（kind:0）の編集。フォームはここに挙げた項目だけを扱い、保存する
 * ときは変えた項目だけを最新の版へ重ねる（`mergeProfile`）。ほかのアプリが
 * 入れた項目（lud06 など）には触れない。
 */
export const PROFILE_FIELDS = [
  "display_name",
  "name",
  "about",
  "picture",
  "banner",
  "nip05",
  "website",
  /** Zap の受け取り先（ライトニングアドレス。LUD-16）。 */
  "lud16",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileDraft = Record<ProfileField, string>;

const emptyDraft = (): ProfileDraft => ({
  display_name: "",
  name: "",
  about: "",
  picture: "",
  banner: "",
  nip05: "",
  website: "",
  lud16: "",
});

/** kind:0 の content から、フォームに入れる値を読む。文字列でない値は空にする。 */
export const profileDraftFrom = (content: string | undefined): ProfileDraft => {
  const draft = emptyDraft();
  if (!content) return draft;
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return draft;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return draft;
  const record = json as Record<string, unknown>;
  for (const field of PROFILE_FIELDS) {
    const value = record[field];
    if (typeof value === "string") draft[field] = value;
  }
  return draft;
};

export type ProfileEditState = {
  /** 読み取った版。変えたかどうかは、これと比べて決める。 */
  base: ProfileDraft;
  draft: ProfileDraft;
  saving: boolean;
};

export type ProfileEditEvent =
  /** 自分の kind:0 が届いた（別の端末で変えた版も含む）。 */
  | { type: "profile/loaded"; content: string | undefined }
  | { type: "profile/input"; field: ProfileField; value: string }
  | { type: "profile/save" }
  | { type: "profile/saved" }
  | { type: "profile/failed" }
  /** 変えたところを捨てて、読み取った版に戻す。 */
  | { type: "profile/reset" };

/** 呼ぶたびに新しく作る。受け取った側が書き換えても他へ漏れないようにする。 */
export const emptyProfileEdit = (): ProfileEditState => ({
  base: emptyDraft(),
  draft: emptyDraft(),
  saving: false,
});

const changedFields = (state: ProfileEditState): ProfileField[] =>
  PROFILE_FIELDS.filter(
    (field) => state.draft[field].trim() !== state.base[field].trim(),
  );

export const isProfileDirty = (state: ProfileEditState): boolean =>
  changedFields(state).length > 0;

/** 保存するときに重ねる値。変えた項目だけ。前後の空白は落とす。 */
export const profileChanges = (
  state: ProfileEditState,
): Partial<Record<ProfileField, string>> =>
  Object.fromEntries(
    changedFields(state).map((field) => [field, state.draft[field].trim()]),
  );

export const profileEditTransition = (
  state: ProfileEditState,
  event: ProfileEditEvent,
): ProfileEditState => {
  switch (event.type) {
    case "profile/loaded": {
      const base = profileDraftFrom(event.content);
      // 書きかけの項目は残し、触っていない項目は届いた版に合わせる。触っていない
      // 項目まで古い値のままにすると、保存したときに別の端末の変更を戻してしまう。
      const draft = { ...base };
      for (const field of PROFILE_FIELDS) {
        if (state.draft[field].trim() !== state.base[field].trim()) {
          draft[field] = state.draft[field];
        }
      }
      return { ...state, base, draft };
    }
    case "profile/input":
      return {
        ...state,
        draft: { ...state.draft, [event.field]: event.value },
      };
    case "profile/save":
      return state.saving || !isProfileDirty(state)
        ? state
        : { ...state, saving: true };
    case "profile/saved":
      // 保存した版がまだ届いていなくても、書いた値を読み取った版とみなす。
      return {
        base: { ...state.draft },
        draft: { ...state.draft },
        saving: false,
      };
    case "profile/failed":
      return state.saving ? { ...state, saving: false } : state;
    case "profile/reset":
      return { ...state, draft: { ...state.base } };
  }
};

const URL_MESSAGE = "https:// で始まる URL を入力してください";
const NIP05_MESSAGE = "name@example.com の形で入力してください";
const LIGHTNING_ADDRESS_MESSAGE =
  "name@wallet.example の形で入力してください（ウォレットのアプリに表示されています）";

/**
 * 空欄は誤りにしない（書かない、という選択）。前後の空白は落としてから確かめる。
 * union は中の検証の文言を返すので、文言は中の検証それぞれに付ける。
 */
const blankOr = (schema: v.GenericSchema<string, string>) =>
  v.pipe(v.string(), v.trim(), v.union([v.literal(""), schema]));

const webUrl = blankOr(
  v.pipe(v.string(), v.url(URL_MESSAGE), v.regex(/^https?:\/\//i, URL_MESSAGE)),
);

const profileSchema = v.object({
  picture: webUrl,
  banner: webUrl,
  website: webUrl,
  nip05: blankOr(
    v.pipe(v.string(), v.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, NIP05_MESSAGE)),
  ),
  // LUD-16 の名前の部分は a-z 0-9 - _ . だけ。大文字はウォレットによって書くので許す。
  lud16: blankOr(
    v.pipe(
      v.string(),
      v.regex(/^[a-z0-9._-]+@[^\s@]+\.[^\s@]+$/i, LIGHTNING_ADDRESS_MESSAGE),
    ),
  ),
});

/** 保存を止める誤り。項目ごとに最初の 1 つを返す。 */
export const profileErrors = (
  draft: ProfileDraft,
): Partial<Record<ProfileField, string>> => {
  const result = v.safeParse(profileSchema, draft);
  if (result.success) return {};
  const nested = v.flatten<typeof profileSchema>(result.issues).nested ?? {};
  const errors: Partial<Record<ProfileField, string>> = {};
  for (const [field, messages] of Object.entries(nested)) {
    const message = messages?.[0];
    if (message) errors[field as ProfileField] = message;
  }
  return errors;
};

/**
 * 書きかけを、読む側（カラムの先頭など）と同じ形にする。見本を本物と同じ部品で
 * 描くため。空欄は「書いていない」として扱う。
 */
export const profileFromDraft = (draft: ProfileDraft): Profile => {
  const text = (value: string) => value.trim() || undefined;
  return {
    name: text(draft.name),
    displayName: text(draft.display_name),
    picture: text(draft.picture),
    about: text(draft.about),
    banner: text(draft.banner),
  };
};
