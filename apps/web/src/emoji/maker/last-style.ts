import type { Style } from "@streets/core/emoji-maker/style";
import { createSignal } from "solid-js";

/** 最後に送った見た目。端末ごとに覚える（ピッカーの下端の 4 つ目に出す）。 */
const STORAGE_KEY = "streets.v1.emojiMaker.lastStyle";

const read = (): Style | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return undefined;
    const value = JSON.parse(raw) as Partial<Style>;
    return typeof value.color === "string" &&
      typeof value.outlineWidth === "number" &&
      (value.font === "gothic" ||
        value.font === "rounded" ||
        value.font === "serif")
      ? (value as Style)
      : undefined;
  } catch {
    return undefined;
  }
};

const [lastStyle, setLastStyle] = createSignal(read());

export { lastStyle };

export const rememberLastStyle = (style: Style) => {
  setLastStyle(style);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
  } catch {
    // 保存できなくても、いまの画面には当たっている。
  }
};
