import {
  type Component,
  type JSX,
  type ParentComponent,
  splitProps,
} from "solid-js";

/**
 * - `primary`：その画面でいちばん押してほしい操作（投稿・追加・保存・フォロー）
 * - `secondary`：並べて置く普通の操作、状態を表すもの（フォロー中）
 * - `danger`：取り消せない、または失うものがある操作（削除・ログアウト・フォロー解除）
 * - `muted`：送っている途中など、押せないことを見せたいとき
 * - `ghost`：枠も背景も要らない小さな操作（閉じる・メニュー）
 * - `overlay`：画像の拡大表示のように、暗い背景や写真の上に重ねて置く操作
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "muted"
  | "ghost"
  | "overlay";
export type ButtonSize = "sm" | "md";

/** 種類ごとの色。アイコンだけのボタン（IconButton）も同じ色を使う。 */
export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent-primary c-white enabled:hover:bg-accent-hover",
  secondary:
    "border border-control bg-primary c-primary enabled:hover:bg-secondary",
  danger:
    "border border-control bg-primary c-danger enabled:hover:bg-secondary",
  muted: "bg-secondary c-secondary",
  ghost: "bg-transparent c-secondary enabled:hover:bg-secondary",
  overlay: "bg-ui-950/60 c-white enabled:hover:bg-ui-950/80",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7.5 gap-1 px-3.5",
  md: "h-8.5 gap-1.5 px-4.5",
};

/** 文字は必須。アイコンだけのボタンは IconButton を使う。 */
export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: JSX.Element;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 角を丸めきらない形。一覧の中で横幅いっぱいに置くときに使う。 */
  shape?: "pill" | "rounded";
  /** 横幅いっぱいにする。 */
  block?: boolean;
  /** 先頭に置くアイコンの class（`i-material-symbols:…`）。 */
  icon?: string;
  /** 文字の後ろに置くアイコンの class。押した先が画面の外にあること（外部リンク）などを示す。 */
  trailingIcon?: string;
};

export type ButtonLinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> &
  Pick<
    ButtonProps,
    | "variant"
    | "size"
    | "shape"
    | "block"
    | "icon"
    | "trailingIcon"
    | "children"
  >;

type VisualProps = Pick<
  ButtonProps,
  "variant" | "size" | "shape" | "block" | "icon" | "class" | "children"
>;

const buttonClassName = (props: VisualProps, link = false): string => {
  return [
    `inline-flex min-w-0 shrink-0 items-center justify-center whitespace-nowrap font-600 text-caption transition-colors ${link ? "cursor-pointer" : "enabled:cursor-pointer disabled:cursor-default"}`,
    props.shape === "rounded" ? "rounded-2" : "rounded-full",
    SIZE[props.size ?? "md"],
    link
      ? BUTTON_VARIANT[props.variant ?? "secondary"].replaceAll("enabled:", "")
      : BUTTON_VARIANT[props.variant ?? "secondary"],
    link || props.variant === "muted" ? "" : "disabled:opacity-50",
    props.block ? "w-full" : "",
    props.class ?? "",
  ]
    .filter(Boolean)
    .join(" ");
};

const ButtonIcon: Component<Pick<ButtonProps, "size"> & { icon: string }> = (
  props,
) => (
  <span
    class={`${props.icon} shrink-0 ${props.size === "sm" ? "size-3.5" : "size-4"}`}
    aria-hidden="true"
  />
);

const ButtonContents: ParentComponent<
  Pick<ButtonProps, "icon" | "trailingIcon" | "size">
> = (props) => (
  <>
    {props.icon ? <ButtonIcon icon={props.icon} size={props.size} /> : null}
    <span class="min-w-0 truncate">{props.children}</span>
    {props.trailingIcon ? (
      <ButtonIcon icon={props.trailingIcon} size={props.size} />
    ) : null}
  </>
);

/**
 * ボタンの見た目の元。種類ごとの色は 1 つの class にまとめて当てる ——
 * 固定の class と classList に色を分けて書くと、どちらが勝つかが CSS の並びで決まる。
 */
const Button: Component<ButtonProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "variant",
    "size",
    "shape",
    "block",
    "icon",
    "trailingIcon",
    "class",
    "children",
    "type",
  ]);
  return (
    <button type={own.type ?? "button"} class={buttonClassName(own)} {...rest}>
      <ButtonContents
        icon={own.icon}
        trailingIcon={own.trailingIcon}
        size={own.size}
      >
        {own.children}
      </ButtonContents>
    </button>
  );
};

/** 別ページへ移動する操作を、ボタンと同じ見た目で表示する。 */
export const ButtonLink: Component<ButtonLinkProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "variant",
    "size",
    "shape",
    "block",
    "icon",
    "trailingIcon",
    "class",
    "children",
  ]);
  return (
    <a class={buttonClassName(own, true)} {...rest}>
      <ButtonContents
        icon={own.icon}
        trailingIcon={own.trailingIcon}
        size={own.size}
      >
        {own.children}
      </ButtonContents>
    </a>
  );
};

export default Button;
