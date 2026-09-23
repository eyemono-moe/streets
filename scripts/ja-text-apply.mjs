/**
 * 直した CSV を、元のソースへ書き戻す。
 *
 *   node scripts/ja-text-apply.mjs tmp/ja-text.csv          # 何が変わるか見るだけ
 *   node scripts/ja-text-apply.mjs tmp/ja-text.csv --write  # 実際に書き換える
 *
 * CSV の `text` の列を直接書き換えて渡す。場所は `file` `kind` `index` で
 * 決まるので、文を書き換えても当たる（行番号は見ない。整形で動くため）。
 * 行を消しても良いが、`file` `kind` `index` は触らないこと。ソースの側を
 * 直したあとは、集め直してから使う（`index` がずれるため）。
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

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { jsx: 4 },
});

const problems = [];
const applied = [];
const byFile = new Map();
for (const row of rows) {
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
  const wanted = new Map(
    fileRows.map((row) => [`${row.kind}:${row.index}`, row]),
  );
  /** 集めたときと同じ数え方。ここがずれると別の場所を書き換えてしまう。 */
  const counts = new Map();
  const take = (kind) => {
    const index = counts.get(kind) ?? 0;
    counts.set(kind, index + 1);
    return wanted.get(`${kind}:${index}`);
  };

  file.forEachDescendant((node) => {
    switch (node.getKind()) {
      case SyntaxKind.JsxText: {
        const raw = node.getLiteralText();
        const text = normalizeJsxText(raw);
        if (text === "" || !hasJapanese(text)) break;
        const row = take("jsx-text");
        if (!row || row.text === text) break;
        // 前後の改行と字下げは残し、見える部分だけを入れ替える（整形は biome に任せる）。
        const start = raw.length - raw.trimStart().length;
        const end = raw.trimEnd().length;
        node.replaceWithText(raw.slice(0, start) + row.text + raw.slice(end));
        applied.push({ row, before: text });
        break;
      }
      case SyntaxKind.StringLiteral: {
        const text = node.getLiteralValue();
        if (text.trim() === "" || !hasJapanese(text)) break;
        const inJsxAttribute =
          node.getParentIfKind(SyntaxKind.JsxAttribute) !== undefined;
        const row = take(inJsxAttribute ? "jsx-attribute" : "string-literal");
        if (!row || row.text === text) break;
        node.setLiteralValue(row.text);
        applied.push({ row, before: text });
        break;
      }
      case SyntaxKind.NoSubstitutionTemplateLiteral:
      case SyntaxKind.TemplateExpression: {
        const raw = node.getText().slice(1, -1);
        if (raw.trim() === "" || !hasJapanese(raw)) break;
        const row = take("template-literal");
        if (!row || row.text === raw) break;
        if (!samePlaceholders(raw, row.text)) {
          problems.push(
            `${path}: 差し込み（\${…}）が変わっています。直さずに残しました: ${raw}`,
          );
          break;
        }
        node.replaceWithText(`\`${row.text}\``);
        applied.push({ row, before: raw });
        break;
      }
      default:
        break;
    }
  });

  for (const row of fileRows) {
    if (Number(row.index) >= (counts.get(row.kind) ?? 0)) {
      problems.push(
        `${path}: ${row.kind} の ${row.index} 番目がありません。ソースが変わっているので集め直してください`,
      );
    }
  }
}

for (const { row } of applied) {
  if (!hasJapanese(row.text)) {
    problems.push(
      `${row.position} 直したあとの文に日本語がありません: ${row.text}`,
    );
  }
}

for (const { row, before } of applied) {
  console.log(`- ${row.position} ${before} → ${row.text}`);
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
