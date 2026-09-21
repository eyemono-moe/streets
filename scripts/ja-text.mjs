/**
 * 画面に出る日本語を集めて直すための道具（`ja-text-extract.mjs` と
 * `ja-text-apply.mjs` が使う）。CSV の読み書きと、書き戻すときの照合に使う値を
 * ここに置く。
 *
 * 1 件はこの形（CSV の列もこの順）。
 *
 *   type JapaneseTextEntry = {
 *     file: string;
 *     line: number;
 *     column: number;
 *     kind: "jsx-text" | "jsx-attribute" | "string-literal" | "template-literal";
 *     // 同じ文が同じファイルに複数あるとき、何番目か（0 始まり）。行がずれても
 *     // 書き戻せるよう、行番号ではなくこれで照合する。
 *     occurrence: number;
 *     text: string;
 *     llmLikelihood?: "low" | "medium" | "high";
 *     reason?: string;
 *     suggestedText?: string;
 *   };
 */

export const COLUMNS = [
  "file",
  "line",
  "column",
  "kind",
  "occurrence",
  "text",
  "llmLikelihood",
  "reason",
  "suggestedText",
];

/** ひらがな・カタカナ・漢字・日本語の約物のどれかを含むか。 */
const JAPANESE =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー、。「」]/u;

export const hasJapanese = (text) => JAPANESE.test(text);

/**
 * JSX の地の文は、折り返しで改行と字下げが入る。描くときは 1 つの空白に
 * まとめられるので、集めるときも同じ形にそろえる（人が直しやすい）。
 */
export const normalizeJsxText = (text) => text.replace(/\s+/g, " ").trim();

const escapeCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (entries) => {
  const lines = [COLUMNS.join(",")];
  for (const entry of entries) {
    lines.push(COLUMNS.map((column) => escapeCell(entry[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
};

/** RFC 4180 の CSV を読む。引用の中の改行とカンマをそのまま持てる。 */
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let index = 0;
  const body = text.replace(/^﻿/, "");
  while (index < body.length) {
    const char = body[index];
    if (quoted) {
      if (char === '"') {
        if (body[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      index += 1;
      continue;
    }
    if (char === "\r") {
      index += 1;
      continue;
    }
    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      index += 1;
      continue;
    }
    cell += char;
    index += 1;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...rest] = rows;
  if (!header) return [];
  return rest
    .filter((cells) => cells.some((value) => value !== ""))
    .map((cells) =>
      Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])),
    );
};

/** `${...}` の中身。書き戻すときに、消えたり増えたりしていないかを見る。 */
export const placeholders = (text) => {
  const found = [];
  const re = /\$\{([^}]*)\}/g;
  let match = re.exec(text);
  while (match) {
    found.push(match[1].trim());
    match = re.exec(text);
  }
  return found;
};

export const samePlaceholders = (before, after) => {
  const a = placeholders(before);
  const b = placeholders(after);
  return a.length === b.length && a.every((value, i) => value === b[i]);
};

/**
 * 機械で分かる範囲の「LLM が書いた文らしさ」。当てにするものではなく、人が見る
 * 順番を決めるための目安。判定そのものは LLM と人が CSV の上で直す。
 */
const RULES = [
  {
    pattern: /することができます|することが可能です/,
    reason: "冗長な可能表現",
  },
  {
    pattern: /を行います|を行ってください|を実施/,
    reason: "「〜を行う」の言い回し",
  },
  { pattern: /適切に|正しく設定|必要に応じて/, reason: "中身の無い副詞" },
  { pattern: /ご利用|いただけます|くださいませ/, reason: "過剰な敬語" },
  {
    pattern: /エラーが発生しました|問題が発生しました/,
    reason: "定型のエラー文",
  },
  { pattern: /〜|——/, reason: "説明的なダッシュ・波ダッシュ" },
  { pattern: /また、|さらに、|なお、/, reason: "文章語の接続詞" },
  { pattern: /である。|だ。/, reason: "です・ます と だ・である の混在" },
];

export const scoreText = (text) => {
  const hits = RULES.filter((rule) => rule.pattern.test(text));
  // 句点で切らずに長く続く文は、読ませる気の無い説明文になりやすい。
  const longSentence =
    text.replace(/\s+/g, "").length >= 60 && !text.includes("。");
  const reasons = hits.map((hit) => hit.reason);
  if (longSentence) reasons.push("一文が長い");
  const level =
    reasons.length >= 2 ? "high" : reasons.length === 1 ? "medium" : "low";
  return { level, reason: reasons.join(" / ") };
};

export const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
