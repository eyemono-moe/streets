/**
 * 画面に出る日本語を集めて CSV（と JSON）にする。
 *
 *   node scripts/ja-text-extract.mjs --out tmp/ja-text.csv
 *
 * 集めるのは JSX の地の文・JSX の属性・文字列・テンプレート文字列のうち、
 * 日本語を含むもの。コメントは集めない（画面に出ないため）。
 *
 * オプション
 *   --out <path>        書き出し先（拡張子 .csv / .json）。既定は tmp/ja-text.csv
 *   --root <dir>        見に行く場所。複数指定できる。既定は apps/web/src と packages/core/src
 *   --include-stories   *.stories.tsx も集める（既定は除く）
 *   --include-tests     *.test.ts(x) も集める（既定は除く）
 *   --sort              LLM っぽさの目安が高い順に並べる（既定はファイル順）
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import {
  LEVEL_ORDER,
  hasJapanese,
  normalizeJsxText,
  scoreText,
  toCsv,
} from "./ja-text.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const values = (name) =>
  args.flatMap((arg, index) =>
    arg === `--${name}` && args[index + 1] ? [args[index + 1]] : [],
  );

const repoRoot = resolve(import.meta.dirname, "..");
const roots = values("root").length
  ? values("root")
  : ["apps/web/src", "packages/core/src"];
const out = values("out")[0] ?? "tmp/ja-text.csv";

const project = new Project({
  tsConfigFilePath: undefined,
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { jsx: 4, allowJs: false },
});
for (const root of roots) {
  project.addSourceFilesAtPaths([
    `${resolve(repoRoot, root)}/**/*.ts`,
    `${resolve(repoRoot, root)}/**/*.tsx`,
  ]);
}

const skip = (path) =>
  (!flag("include-stories") && path.endsWith(".stories.tsx")) ||
  (!flag("include-tests") &&
    (path.endsWith(".test.ts") || path.endsWith(".test.tsx")));

const entries = [];

for (const file of project.getSourceFiles()) {
  const path = relative(repoRoot, file.getFilePath());
  if (skip(path)) continue;
  /** 同じ文が同じファイルに何度も出るときの通し番号。 */
  const seen = new Map();

  const push = (node, kind, text) => {
    if (!hasJapanese(text)) return;
    const key = `${kind}\u0000${text}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const { line, column } = file.getLineAndColumnAtPos(node.getStart());
    const { level, reason } = scoreText(text);
    entries.push({
      file: path,
      line,
      column,
      kind,
      occurrence,
      text,
      llmLikelihood: level,
      reason,
      suggestedText: "",
    });
  };

  file.forEachDescendant((node) => {
    switch (node.getKind()) {
      case SyntaxKind.JsxText: {
        const text = normalizeJsxText(node.getLiteralText());
        if (text !== "") push(node, "jsx-text", text);
        break;
      }
      case SyntaxKind.StringLiteral: {
        const text = node.getLiteralValue();
        if (text.trim() === "") break;
        const inJsxAttribute =
          node.getParentIfKind(SyntaxKind.JsxAttribute) !== undefined;
        push(node, inJsxAttribute ? "jsx-attribute" : "string-literal", text);
        break;
      }
      case SyntaxKind.NoSubstitutionTemplateLiteral:
      case SyntaxKind.TemplateExpression: {
        // `${}` を含む形のまま持つ。差し込みを消されていないか、戻すときに見る。
        const raw = node.getText().slice(1, -1);
        if (raw.trim() !== "") push(node, "template-literal", raw);
        break;
      }
      default:
        break;
    }
  });
}

if (flag("sort")) {
  entries.sort(
    (a, b) =>
      LEVEL_ORDER[a.llmLikelihood] - LEVEL_ORDER[b.llmLikelihood] ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

const target = resolve(repoRoot, out);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(
  target,
  out.endsWith(".json")
    ? `${JSON.stringify(entries, null, 2)}\n`
    : toCsv(entries),
);

const counts = entries.reduce((acc, entry) => {
  acc[entry.kind] = (acc[entry.kind] ?? 0) + 1;
  return acc;
}, {});
const levels = entries.reduce((acc, entry) => {
  acc[entry.llmLikelihood] = (acc[entry.llmLikelihood] ?? 0) + 1;
  return acc;
}, {});
console.log(`${entries.length} 件を ${out} に書き出しました`);
console.log("種類:", counts);
console.log("目安:", levels);
