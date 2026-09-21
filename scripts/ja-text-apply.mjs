/**
 * 直した CSV を、元のソースへ書き戻す。
 *
 *   node scripts/ja-text-apply.mjs tmp/ja-text.csv          # 何が変わるか見るだけ
 *   node scripts/ja-text-apply.mjs tmp/ja-text.csv --write  # 実際に書き換える
 *
 * 書き戻すのは `suggestedText` が入っていて、元の文と違う行だけ。照合は
 * ファイル・種類・元の文・`occurrence` で行う（行番号は見ない。整形で動くため）。
 * `text` の列は触らないこと —— 元の場所を見つけるための鍵になっている。
 *
 * 書き換えたあとは `pnpm fix` で整形し、`pnpm verify` を通すこと。
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import {
  hasJapanese,
  normalizeJsxText,
  parseCsv,
  samePlaceholders,
} from "./ja-text.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const csvPath = args.find((arg) => !arg.startsWith("--"));
if (!csvPath) {
  console.error("CSV の場所を指定してください");
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, "..");
const rows = parseCsv(readFileSync(resolve(repoRoot, csvPath), "utf8"));
const changes = rows.filter(
  (row) => row.suggestedText !== "" && row.suggestedText !== row.text,
);

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { jsx: 4 },
});

const problems = [];
const applied = [];
const byFile = new Map();
for (const row of changes) {
  const list = byFile.get(row.file) ?? [];
  list.push(row);
  byFile.set(row.file, list);
}

for (const [path, fileRows] of byFile) {
  const file = project.addSourceFileAtPathIfExists(resolve(repoRoot, path));
  if (!file) {
    problems.push(`${path}: ファイルが見つかりません`);
    continue;
  }
  /** 元の文と同じものを、ファイルの上から数えて何番目か。 */
  const seen = new Map();
  const wanted = new Map(
    fileRows.map((row) => [
      `${row.kind}\u0000${row.text}\u0000${row.occurrence}`,
      row,
    ]),
  );

  const take = (kind, text) => {
    const key = `${kind}\u0000${text}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return wanted.get(`${key}\u0000${occurrence}`);
  };

  file.forEachDescendant((node) => {
    switch (node.getKind()) {
      case SyntaxKind.JsxText: {
        const raw = node.getLiteralText();
        const text = normalizeJsxText(raw);
        if (text === "") break;
        const row = take("jsx-text", text);
        if (!row) break;
        // 前後の改行と字下げは残し、見える部分だけを入れ替える（整形は biome に任せる）。
        const start = raw.length - raw.trimStart().length;
        const end = raw.trimEnd().length;
        node.replaceWithText(
          raw.slice(0, start) + row.suggestedText + raw.slice(end),
        );
        applied.push(row);
        break;
      }
      case SyntaxKind.StringLiteral: {
        const text = node.getLiteralValue();
        if (text.trim() === "") break;
        const inJsxAttribute =
          node.getParentIfKind(SyntaxKind.JsxAttribute) !== undefined;
        const row = take(
          inJsxAttribute ? "jsx-attribute" : "string-literal",
          text,
        );
        if (!row) break;
        node.setLiteralValue(row.suggestedText);
        applied.push(row);
        break;
      }
      case SyntaxKind.NoSubstitutionTemplateLiteral:
      case SyntaxKind.TemplateExpression: {
        const raw = node.getText().slice(1, -1);
        if (raw.trim() === "") break;
        const row = take("template-literal", raw);
        if (!row) break;
        if (!samePlaceholders(raw, row.suggestedText)) {
          problems.push(
            `${path}: 差し込み（\${…}）が変わっています。直さずに残しました: ${raw}`,
          );
          break;
        }
        node.replaceWithText(`\`${row.suggestedText}\``);
        applied.push(row);
        break;
      }
      default:
        break;
    }
  });
}

const appliedSet = new Set(applied);
for (const row of changes) {
  if (appliedSet.has(row)) continue;
  if (!problems.some((problem) => problem.startsWith(`${row.file}:`))) {
    problems.push(
      `${row.file}:${row.line} 元の文が見つかりません（text の列を書き換えていませんか）: ${row.text}`,
    );
  }
}
for (const row of applied) {
  if (!hasJapanese(row.suggestedText)) {
    problems.push(
      `${row.file}:${row.line} 直したあとの文に日本語がありません: ${row.suggestedText}`,
    );
  }
}

for (const row of applied) {
  console.log(`- ${row.file}:${row.line} ${row.text} → ${row.suggestedText}`);
}
for (const problem of problems) console.error(`! ${problem}`);

if (write) {
  project.saveSync();
  console.log(
    `${applied.length} 件を書き戻しました（${byFile.size} ファイル）。pnpm fix で整形してください`,
  );
} else {
  console.log(
    `${applied.length} 件が書き戻せます。実際に書き換えるには --write を付けてください`,
  );
  for (const file of project.getSourceFiles()) {
    console.log(`  ${relative(repoRoot, file.getFilePath())}`);
  }
}
process.exit(problems.length > 0 ? 1 : 0);
