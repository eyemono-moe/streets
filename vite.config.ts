import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    // Biome の既定に合わせ、移すときに全体が組み直されないようにする。
    printWidth: 80,
    sortImports: { newlinesBetween: false },
    // 表の桁揃えなどで文書の差分が膨らむので、Markdown は整形しない。
    ignorePatterns: ["worker-configuration.d.ts", "**/*.md"],
  },
  lint: {
    plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "jsx-a11y"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Solid の `ref={el}` は代入の形に見えない。
      "no-unassigned-vars": "off",
      // 回しながら元を書き換える（購読を外す・消す）ので、先に写し取っている。
      "unicorn/no-useless-spread": "off",
      // interface をメソッドの形で書き、実体は this を使わないクロージャで作っている。
      "typescript/unbound-method": "off",
      // Solid は `htmlFor` ではなく `for` で結ぶ。
      "jsx-a11y/label-has-associated-control": "off",
      // UnoCSS のアイコンは CSS で描くので、`<img>` に置き換えられない。
      "jsx-a11y/prefer-tag-over-role": "off",
      // 文字を部品で包んで入れ子が深くなっても、名前として読む。
      "jsx-a11y/control-has-associated-label": ["error", { depth: 6 }],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
    overrides: [
      {
        // テストの枠組み（node:test の test() など）が返す Promise は待たなくてよい。
        files: ["**/*.test.{ts,tsx,mjs}"],
        rules: { "typescript/no-floating-promises": "off" },
      },
    ],
    ignorePatterns: ["worker-configuration.d.ts"],
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
      reportUnusedDisableDirectives: "error",
    },
  },
});
