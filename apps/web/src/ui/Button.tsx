import { type JSX, type ParentComponent, splitProps } from "solid-js";

/**
 * - `primary`：その画面でいちばん押してほしい操作（投稿・追加・保存・フォロー）
 * - `secondary`：並べて置く普通の操作、状態を表すもの（フォロー中）
 * - `danger`：取り消せない、または失うものがある操作（削除・ログアウト・フォロー解除）
 * - `muted`：送っている途中など、押せないことを見せたいとき
 * - `ghost`：枠も背景も要らない小さな操作（閉じる・メニュー）
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "muted"
  | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent-primary c-white enabled:hover:bg-accent-hover",
  secondary:
    "border border-primary bg-primary c-primary enabled:hover:bg-secondary",
  danger:
    "border border-primary bg-primary c-danger enabled:hover:bg-secondary",
  muted: "bg-secondary c-secondary",
  ghost: "bg-transparent c-secondary enabled:hover:bg-secondary",
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
  const iconOnly = () => own.icon !== undefined && own.children === undefined;
  const className = () =>
    [
      // 高さを決めているので、折り返さずに切る。
      "inline-flex min-w-0 shrink-0 items-center justify-center whitespace-nowrap font-600 text-caption transition-colors enabled:cursor-pointer disabled:cursor-default",
      own.shape === "rounded" ? "rounded-2" : "rounded-full",
      iconOnly() ? ICON_ONLY_SIZE[own.size ?? "md"] : SIZE[own.size ?? "md"],
      VARIANT[own.variant ?? "secondary"],
      // muted は押せない見た目そのものなので、さらに薄くしない。
      own.variant === "muted" ? "" : "disabled:opacity-50",
      own.block ? "w-full" : "",
      own.class ?? "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <button type={own.type ?? "button"} class={className()} {...rest}>
      {own.icon ? (
        <span
          class={`${own.icon} shrink-0 ${own.size === "sm" ? "size-3.5" : "size-4"}`}
          aria-hidden="true"
        />
      ) : null}
      {/* 空の span でも gap が効いて、アイコンが中心からずれる。 */}
      {iconOnly() ? null : <span class="min-w-0 truncate">{own.children}</span>}
    </button>
  );
};

export default Button;
