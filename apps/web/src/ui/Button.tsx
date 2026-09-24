import { type JSX, type ParentComponent, splitProps } from "solid-js";

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

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent-primary c-white enabled:hover:bg-accent-hover",
  secondary:
    "border border-primary bg-primary c-primary enabled:hover:bg-secondary",
  danger:
    "border border-primary bg-primary c-danger enabled:hover:bg-secondary",
  muted: "bg-secondary c-secondary",
  ghost: "bg-transparent c-secondary enabled:hover:bg-secondary",
  overlay: "bg-ui-950/60 c-white enabled:hover:bg-ui-950/80",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7.5 gap-1 px-3.5",
  md: "h-8.5 gap-1.5 px-4.5",
};

const ICON_ONLY_SIZE: Record<ButtonSize, string> = {
  sm: "size-7.5",
  md: "size-8.5",
};

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 角を丸めきらない形。一覧の中で横幅いっぱいに置くときに使う。 */
  shape?: "pill" | "rounded";
  /** 横幅いっぱいにする。 */
  block?: boolean;
  /** 先頭に置くアイコンの class（`i-material-symbols:…`）。文字が無ければ、アイコンだけの正方形になる。 */
  icon?: string;
};

export type ButtonLinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> &
  Pick<ButtonProps, "variant" | "size" | "shape" | "block" | "icon">;

type VisualProps = Pick<
  ButtonProps,
  "variant" | "size" | "shape" | "block" | "icon" | "class" | "children"
>;

const buttonClassName = (props: VisualProps, link = false): string => {
  const iconOnly = props.icon !== undefined && props.children === undefined;
  return [
    `inline-flex min-w-0 shrink-0 items-center justify-center whitespace-nowrap font-600 text-caption transition-colors ${link ? "cursor-pointer" : "enabled:cursor-pointer disabled:cursor-default"}`,
    props.shape === "rounded" ? "rounded-2" : "rounded-full",
    iconOnly ? ICON_ONLY_SIZE[props.size ?? "md"] : SIZE[props.size ?? "md"],
    link
      ? VARIANT[props.variant ?? "secondary"].replaceAll("enabled:", "")
      : VARIANT[props.variant ?? "secondary"],
    link || props.variant === "muted" ? "" : "disabled:opacity-50",
    props.block ? "w-full" : "",
    props.class ?? "",
  ]
    .filter(Boolean)
    .join(" ");
};

const ButtonContents: ParentComponent<Pick<ButtonProps, "icon" | "size">> = (
  props,
) => {
  const iconOnly = () =>
    props.icon !== undefined && props.children === undefined;
  return (
    <>
      {props.icon ? (
        <span
          class={`${props.icon} shrink-0 ${props.size === "sm" ? "size-3.5" : "size-4"}`}
          aria-hidden="true"
        />
      ) : null}
      {iconOnly() ? null : (
        <span class="min-w-0 truncate">{props.children}</span>
      )}
    </>
  );
};

/**
 * ボタンの見た目の元。種類ごとの色は 1 つの class にまとめて当てる ——
 * 固定の class と classList に色を分けて書くと、どちらが勝つかが CSS の並びで決まる。
 */
const Button: ParentComponent<ButtonProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "variant",
    "size",
    "shape",
    "block",
    "icon",
    "class",
    "children",
    "type",
  ]);
  return (
    <button type={own.type ?? "button"} class={buttonClassName(own)} {...rest}>
      <ButtonContents icon={own.icon} size={own.size}>
        {own.children}
      </ButtonContents>
    </button>
  );
};

/** 別ページへ移動する操作を、ボタンと同じ見た目で表示する。 */
export const ButtonLink: ParentComponent<ButtonLinkProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "variant",
    "size",
    "shape",
    "block",
    "icon",
    "class",
    "children",
  ]);
  return (
    <a class={buttonClassName(own, true)} {...rest}>
      <ButtonContents icon={own.icon} size={own.size}>
        {own.children}
      </ButtonContents>
    </a>
  );
};

export default Button;
