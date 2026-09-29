import type { ItemVisibility } from "@streets/core/nostr/private-tags";

export const VISIBILITY_LABEL: Record<ItemVisibility, string> = {
  private: "非公開",
  public: "公開",
};

export const MEMBER_VISIBILITY_HINT: Record<ItemVisibility, string> = {
  private:
    "非公開：暗号化して保存するので、この人をリストに入れたことはほかの人には分かりません。",
  public: "公開：この人をリストに入れたことを、ほかの人も見られます。",
};

/** 公開範囲を選ぶ欄の選択肢。非公開を扱えない署名器では、非公開を選べなくする。 */
export const visibilityOptions = (privateReady: boolean) => [
  {
    value: "private" as const,
    label: VISIBILITY_LABEL.private,
    disabled: !privateReady,
    hint: "今のログインの方法では、非公開のメンバーを扱えません",
  },
  { value: "public" as const, label: VISIBILITY_LABEL.public },
];

/** 1 つのリストにこの人を入れるかと、入れるときの公開範囲。 */
export type Membership = ItemVisibility | "none";

/** 「リストに追加」で、リストごとに選ぶ欄の選択肢。 */
export const membershipOptions = (privateReady: boolean) => [
  { value: "none" as const, label: "入れない" },
  ...visibilityOptions(privateReady),
];

export const MEMBERSHIP_HINT =
  "非公開で入れると暗号化して保存するので、入れたことはほかの人には分かりません。公開で入れたことは、ほかの人も見られます。";
