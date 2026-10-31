import type { ItemVisibility } from "@streets/core/nostr/private-tags";
import { t } from "../i18n/locale";

// 設定の画面からも引かれる。最上位で t() を呼ぶと言語を切り替えても変わらないので、
// 読んだ時点で引く getter にする。
export const VISIBILITY_LABEL: Record<ItemVisibility, string> = {
  get private() {
    return t("lists.visibility.label.private");
  },
  get public() {
    return t("lists.visibility.label.public");
  },
};

export const memberVisibilityHint = (visibility: ItemVisibility): string =>
  t(`lists.visibility.memberHint.${visibility}`);

/** 公開範囲を選ぶ欄の選択肢。非公開を扱えない署名器では、非公開を選べなくする。 */
export const visibilityOptions = (privateReady: boolean) => [
  {
    value: "private" as const,
    label: VISIBILITY_LABEL.private,
    disabled: !privateReady,
    hint: t("lists.visibility.privateUnavailable"),
  },
  { value: "public" as const, label: VISIBILITY_LABEL.public },
];

/** 1 つのリストにこの人を入れるかと、入れるときの公開範囲。 */
export type Membership = ItemVisibility | "none";

/** 「リストに追加」で、リストごとに選ぶ欄の選択肢。 */
export const membershipOptions = (privateReady: boolean) => [
  { value: "none" as const, label: t("lists.visibility.none") },
  ...visibilityOptions(privateReady),
];

export const membershipHint = (): string =>
  t("lists.visibility.membershipHint");
