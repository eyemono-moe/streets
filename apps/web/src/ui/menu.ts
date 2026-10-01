/**
 * Ark UI の Menu の見た目。投稿の操作のように項目が 10 前後並ぶメニューもあるので、
 * 本文より一回り小さい文字と詰めた行にして、縦に伸びすぎないようにする。
 * 幅はメニューごとに中身で決まるので、ここでは持たない。
 */
export const menuContentClass =
  "motion-pop c-primary rounded-2.5 border border-primary bg-primary p-1 shadow-lg outline-none";

/**
 * 項目。2 行になる項目（今の状態を添えるものなど）もあるので、高さは下限で決める。
 * Menu.Item は button ではないので、押せるかどうかは `data-disabled` で見分ける。
 */
export const menuItemClass =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-1.5 px-2 py-1 text-[14px] data-[highlighted]:bg-secondary data-[disabled]:cursor-default data-[disabled]:opacity-50";

export const menuIconClass = "size-4 shrink-0";

export const menuGroupLabelClass =
  "c-secondary block px-2 pt-1.5 pb-0.5 font-600 text-caption";

export const menuSeparatorClass = "my-1 border-primary border-t";
