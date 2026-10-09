import type { MenuRootProps } from "@ark-ui/solid/menu";

/**
 * Ark UI の Menu の見た目。投稿の操作のように項目が 10 前後並ぶメニューもあるので、
 * 本文より一回り小さい文字と詰めた行にして、縦に伸びすぎないようにする。
 * 高さは、位置決めが入れる `--available-height`（開いた側に残っている高さ）までにする。
 * 幅はメニューごとに中身で決まるので、ここでは持たない。
 */
export const menuContentClass =
  "motion-pop c-primary max-h-[var(--available-height)] overflow-y-auto overscroll-contain rounded-2.5 border border-control bg-primary p-1 shadow-lg outline-none";

/**
 * 1 件ごとの ⋯ から開くメニューの置き方。上下どちらにも収まらないときは、ボタンの横へ
 * 開く。横なら上端を画面に合わせて縦をほぼ全部使える（`slide` が縦にずらす）。
 * それでも収まらない分は、`menuContentClass` が開いた側の高さで止めて中を流す。
 */
export const itemMenuPositioning: MenuRootProps["positioning"] = {
  placement: "bottom-end",
  flip: ["top-end", "left-start", "right-start"],
};

/**
 * 項目。2 行になる項目（今の状態を添えるものなど）もあるので、高さは下限で決める。
 * Menu.Item は button ではないので、押せるかどうかは `data-disabled` で見分ける。
 */
export const menuItemClass =
  "flex min-h-8 cursor-pointer items-center gap-2 rounded-1.5 px-2 py-1 text-[14px] data-[highlighted]:bg-secondary data-[disabled]:cursor-default data-[disabled]:opacity-50";

export const menuIconClass = "size-4 shrink-0";

export const menuGroupLabelClass =
  "c-secondary block px-2 pt-1.5 pb-0.5 font-600 text-caption";

export const menuSeparatorClass = "my-1 border-control border-t";

/**
 * 入れ子のメニュー。親の項目の横に開く。横に収まらなければ反対側へ返し、上端は項目に合わせる
 * （`slide` が縦にずらす）。
 */
export const nestedMenuPositioning: MenuRootProps["positioning"] = {
  placement: "right-start",
  flip: ["left-start"],
  gutter: 2,
};

/**
 * 触る端末のボトムシート。ポップアップの `menuContentClass` と違い、位置は画面の下端に固定で、
 * 高さは画面の 8 割まで。中の流す部分は呼ぶ側が `overflow-y-auto` で包む。
 */
export const sheetContentClass =
  "motion-drawer c-primary absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3 border-control border-t bg-primary shadow-[0_-10px_30px_rgba(0,0,0,0.28)] outline-none dark:shadow-[0_-10px_30px_rgba(0,0,0,0.7)]";

/**
 * 指で押す項目。折り返さず、押しやすい 44px の高さにする。button はブラウザ既定の背景・枠・文字色
 * （ダークでは白い地に黒い文字）を持つので、`bg-transparent`・`border-0` で消して
 * シートの地に載せる。文字色も既定は黒なので、呼ぶ側が `c-primary` か `c-danger` のどちらか一方を付ける
 * （両方を常に付けると CSS の順で勝つ方が決まる）。押した・焦点が当たったときの色はポップアップの項目と揃える。
 */
export const sheetItemClass =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-1.5 border-0 bg-transparent px-3 text-left text-body outline-none active:bg-alpha-hover focus-visible:bg-alpha-hover disabled:cursor-default disabled:opacity-50";

/** シートの項目のアイコン。指で押す分、ポップアップの `menuIconClass` より大きくする。 */
export const sheetIconClass = "size-6 shrink-0";

export const sheetGroupLabelClass =
  "c-secondary block px-3 pt-2 pb-1 font-600 text-caption";
