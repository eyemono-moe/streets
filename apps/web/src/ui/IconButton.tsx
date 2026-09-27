import { type Component, type JSX, splitProps } from "solid-js";
import { BUTTON_VARIANT, type ButtonVariant } from "./Button";

/**
 * - `sm`：カラムの見出し、投稿やチャットの操作、一覧の行の中など、文字の横に並べるもの
 * - `md`：投稿欄の道具、ダイアログの見出しの「閉じる」など、少し大きく押させたいもの
 * - `lg`：サイドバーのように、アイコンだけで行き先を並べるもの
 */
export type IconButtonSize = "sm" | "md" | "lg";

/**
 * `Button` の種類に、`filled`（薄い背景を敷く。ダイアログやパネルの「閉じる」）を
 * 足したもの。
 */
export type IconButtonVariant = ButtonVariant | "filled";

const SIZE: Record<IconButtonSize, { box: string; icon: string }> = {
  sm: { box: "size-6 rounded-1.5", icon: "size-4.5" },
  md: { box: "size-8 rounded-2", icon: "size-5" },
  lg: { box: "size-10 rounded-2", icon: "size-5.5" },
};

const VARIANT: Record<IconButtonVariant, string> = {
  ...BUTTON_VARIANT,
  filled: "bg-secondary c-primary enabled:hover:bg-tertiary",
};

export type IconButtonProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label"
> & {
  /** アイコンの class（`i-material-symbols:…`）。 */
  icon: string;
  /** 何をするボタンか。読み上げに使い、`title` が無ければツールチップにも出す。 */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** 丸くする。写真の上や、丸いボタンの横に並べるとき。 */
  circle?: boolean;
  /** 入っている状態（お気に入りに入れた、など）。アイコンをアクセント色にする。 */
  active?: boolean;
};

/**
 * アイコンだけのボタン。大きさと色はここで決め、画面ごとに箱やアイコンの大きさを
 * 書かない。位置（`position`）は持たない —— 置く側が `absolute` で重ねられるように。
 */
const IconButton: Component<IconButtonProps> = (props) => {
  const [own, rest] = splitProps(props, [
    "icon",
    "label",
    "variant",
    "size",
    "circle",
    "active",
    "class",
    "type",
    "title",
  ]);
  const size = () => SIZE[own.size ?? "sm"];
  return (
    // 名前は rest より後に置く。Ark UI の開き口が渡す aria-label に上書きさせない。
    <button
      {...rest}
      type={own.type ?? "button"}
      aria-label={own.label}
      title={own.title ?? own.label}
      class={[
        "grid shrink-0 place-items-center transition-colors enabled:cursor-pointer disabled:cursor-default disabled:opacity-50",
        size().box,
        own.circle ? "rounded-full" : "",
        VARIANT[own.variant ?? "ghost"],
        own.active ? "!c-accent-5" : "",
        own.class ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span class={`${own.icon} ${size().icon}`} aria-hidden="true" />
    </button>
  );
};

export default IconButton;
