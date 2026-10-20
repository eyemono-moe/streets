import type { NappletTheme } from "@streets/core/napplet/session";

/**
 * 計算済みの色を `#rrggbb` にする。ダークの背景は oklch で計算されるので、文字列の
 * ままでは NAP-THEME が求める 16 進にならない。canvas に塗って読み戻す。
 */
const toHex = (color: string, doc: Document): string | undefined => {
  const context = doc.createElement("canvas").getContext("2d");
  if (!context) return undefined;
  context.fillStyle = "#000000";
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
};

/** いま描いている Streets の色。napplet をカラムに馴染ませるために渡す。 */
export const currentNappletTheme = (element: Element): NappletTheme => {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const style = view?.getComputedStyle(element);
  const root = view?.getComputedStyle(doc.documentElement);
  const background = style?.backgroundColor ?? "";
  const transparent = /^rgba\(.*,\s*0\)$|^transparent$/.test(background);
  return {
    colors: {
      background:
        toHex(
          transparent
            ? (view?.getComputedStyle(doc.body).backgroundColor ?? "")
            : background,
          doc,
        ) ?? "#ffffff",
      text: toHex(style?.color ?? "", doc) ?? "#000000",
      primary:
        toHex(
          root?.getPropertyValue("--theme-accent-color").trim() ?? "",
          doc,
        ) ?? "#8440bd",
    },
  };
};

const sameTheme = (left: NappletTheme, right: NappletTheme) =>
  left.colors.background === right.colors.background &&
  left.colors.text === right.colors.text &&
  left.colors.primary === right.colors.primary;

/**
 * Streets の色が変わったら知らせる。色はルート要素の属性（テーマ・コントラスト）と
 * OS のダークモードで変わるので、その両方を見る。変わっていなければ知らせない。
 */
export const watchNappletTheme = (
  element: Element,
  onChange: (theme: NappletTheme) => void,
): (() => void) => {
  const doc = element.ownerDocument;
  let last = currentNappletTheme(element);
  const check = () => {
    const next = currentNappletTheme(element);
    if (sameTheme(last, next)) return;
    last = next;
    onChange(next);
  };
  const observer = new MutationObserver(check);
  observer.observe(doc.documentElement, { attributes: true });
  const media = doc.defaultView?.matchMedia("(prefers-color-scheme: dark)");
  media?.addEventListener("change", check);
  return () => {
    observer.disconnect();
    media?.removeEventListener("change", check);
  };
};
