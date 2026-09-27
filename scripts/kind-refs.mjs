import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { ts } from "ts-morph";
import { root } from "./nip-support.mjs";

const sourceRoots = ["packages/core/src", "apps/web/src"];
const sourceFile = (file) =>
  /\.tsx?$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file);
const relative = (file) => path.relative(root, file).replaceAll(path.sep, "/");
const numeric = (node) =>
  ts.isNumericLiteral(node) ? Number(node.text.replaceAll("_", "")) : undefined;

const resolvedModule = (file, specifier, files) => {
  const stem = specifier.startsWith("@streets/core/")
    ? path.join(
        root,
        "packages/core/src",
        specifier.slice("@streets/core/".length),
      )
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(file), specifier)
      : undefined;
  if (!stem) return undefined;
  return [
    `${stem}.ts`,
    `${stem}.tsx`,
    path.join(stem, "index.ts"),
    path.join(stem, "index.tsx"),
  ].find((candidate) => files.has(candidate));
};

/** kind 定数の直接利用と、kind と分かる位置に書かれた数値を拾う。 */
export const kindReferences = async () => {
  const sources = new Map();
  for (const directory of sourceRoots) {
    for await (const file of glob(
      path.join(root, directory, "**/*.{ts,tsx}"),
    )) {
      if (!sourceFile(file)) continue;
      const content = await readFile(file, "utf8");
      sources.set(
        file,
        ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          true,
          file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
        ),
      );
    }
  }
  const declarations = new Map();
  for (const [file, source] of sources) {
    const values = new Map();
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          !ts.isIdentifier(declaration.name) ||
          !declaration.name.text.endsWith("_KIND")
        )
          continue;
        const value =
          declaration.initializer && numeric(declaration.initializer);
        if (value !== undefined) values.set(declaration.name.text, value);
      }
    }
    declarations.set(file, values);
  }
  const index = new Map();
  const add = (kind, file) => {
    const paths = index.get(kind) ?? new Set();
    paths.add(relative(file));
    index.set(kind, paths);
  };
  for (const [file, source] of sources) {
    const names = new Map(declarations.get(file));
    for (const kind of names.values()) add(kind, file);
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const target = resolvedModule(
        file,
        statement.moduleSpecifier.text,
        sources,
      );
      const imports = statement.importClause?.namedBindings;
      if (!target || !imports || !ts.isNamedImports(imports)) continue;
      for (const binding of imports.elements) {
        const kind = declarations
          .get(target)
          ?.get(binding.propertyName?.text ?? binding.name.text);
        if (kind !== undefined) names.set(binding.name.text, kind);
      }
    }
    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const kind = names.get(node.text);
        if (kind !== undefined) add(kind, file);
      }
      if (ts.isPropertyAssignment(node)) {
        const name = node.name.getText(source).replaceAll(/["']/g, "");
        if (name === "kind" || name === "eventKind") {
          const kind = numeric(node.initializer);
          if (kind !== undefined) add(kind, file);
        }
        if (name === "kinds" && ts.isArrayLiteralExpression(node.initializer)) {
          for (const element of node.initializer.elements) {
            const kind = numeric(element);
            if (kind !== undefined) add(kind, file);
          }
        }
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text.endsWith("_KINDS") &&
        node.initializer &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        for (const element of node.initializer.elements) {
          const kind = numeric(element);
          if (kind !== undefined) add(kind, file);
        }
      }
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
        ].includes(node.operatorToken.kind)
      ) {
        const left = node.left.getText(source);
        if (/(?:^|\.)(?:kind|eventKind)$/.test(left)) {
          const kind = numeric(node.right);
          if (kind !== undefined) add(kind, file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return new Map(
    [...index].map(([kind, paths]) => [
      kind,
      [...paths].sort((a, b) => a.localeCompare(b)),
    ]),
  );
};
