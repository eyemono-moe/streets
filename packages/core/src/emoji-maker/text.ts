/** 絵文字にできる字数と行数。 */
export const MAX_CHARS = 12;
export const MAX_LINES = 3;

export type Shape = "square" | "wide";
export type Fit = "stretch" | "keep";
export type Align = "left" | "center" | "right";

/** 行と、その並べ方。 */
export type TextLayout = {
  lines: string[];
  shape: Shape;
  fit: Fit;
  align: Align;
};

const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** 見た目の 1 字ずつに分ける。絵文字の組み合わせを途中で割らない。 */
export const graphemes = (text: string): string[] =>
  Array.from(segmenter.segment(text), (part) => part.segment);

const visibleChars = (text: string) => graphemes(text.replace(/\s/g, ""));

const halves = (chars: string[]) => {
  const perLine = Math.ceil(chars.length / 2);
  return [chars.slice(0, perLine).join(""), chars.slice(perLine).join("")];
};

/**
 * 字数だけで並べ方を決める（打った改行は使わない）。リアクションは高さ 18px で出るので、
 * 行を増やすより横に伸ばす。3 字は「えら／い」の「い」を横に伸ばさないよう、字の形を保って
 * 左に寄せる。
 */
export const autoLayout = (text: string): TextLayout => {
  const chars = visibleChars(text).slice(0, MAX_CHARS);
  const stretch = { fit: "stretch", align: "center" } as const;
  if (chars.length <= 2) {
    return { ...stretch, lines: [chars.join("")], shape: "square" };
  }
  if (chars.length === 3) {
    return {
      lines: halves(chars),
      shape: "square",
      fit: "keep",
      align: "left",
    };
  }
  if (chars.length === 4) {
    return { ...stretch, lines: halves(chars), shape: "square" };
  }
  if (chars.length <= 6) {
    return { ...stretch, lines: [chars.join("")], shape: "wide" };
  }
  return { ...stretch, lines: halves(chars), shape: "wide" };
};

/**
 * 自動で改行するときは字数で決め、しないときは打った行のとおりに並べる（改行が無ければ
 * 1 行）。打った行のときは、1 行の字数が行数より 2 字以上多ければ横長にする。
 */
export const layoutOf = (text: string, autoBreak: boolean): TextLayout => {
  if (autoBreak) return autoLayout(text);
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s/g, ""))
    .filter((line) => line !== "")
    .slice(0, MAX_LINES);
  const longest = Math.max(1, ...lines.map((line) => graphemes(line).length));
  return {
    lines,
    shape: longest <= lines.length + 1 ? "square" : "wide",
    fit: "stretch",
    align: "center",
  };
};

export type TextProblem =
  | { type: "empty" }
  | { type: "too-many-chars"; count: number }
  | { type: "too-many-lines"; count: number };

/** 絵文字にできない入力か。行数は、打った行のとおりに並べるときだけ数える。 */
export const textProblem = (
  text: string,
  autoBreak: boolean,
): TextProblem | undefined => {
  const count = visibleChars(text).length;
  if (count === 0) return { type: "empty" };
  if (count > MAX_CHARS) return { type: "too-many-chars", count };
  if (!autoBreak) {
    const lines = text.split("\n").filter((line) => line.trim() !== "").length;
    if (lines > MAX_LINES) return { type: "too-many-lines", count: lines };
  }
  return undefined;
};
