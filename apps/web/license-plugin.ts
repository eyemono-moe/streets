import type { Plugin } from "vite";

/** 同梱した依存のライセンスを書き出すファイル。`dist` の直下に置き、サイトの `/license.md` で配る。 */
export const LICENSE_FILE = "license.md";

const BANNER = `/*! Licenses of bundled dependencies: /${LICENSE_FILE} */\n`;

/**
 * 配る JS の 1 行目に、ライセンスの在りかを書く。JS だけを手にした人にも分かるようにする。
 *
 * Rolldown の `postBanner` では足りない。Vite が後から一部のチャンクの頭に
 * `__vite__mapDeps` を差し込むので、目印が 2 行目に下がる。ここでは全部が
 * 出そろった後に頭へ足す。
 */
export const licenseBanner = (): Plugin => ({
  name: "streets:license-banner",
  apply: "build",
  enforce: "post",
  generateBundle: {
    order: "post",
    handler(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        chunk.code = BANNER + chunk.code;
        if (!chunk.map) continue;
        // 頭に 1 行増えた分、対応表を 1 行下げる（mappings の `;` は行の区切り）。
        chunk.map.mappings = `;${chunk.map.mappings}`;
        const mapAsset = bundle[`${chunk.fileName}.map`];
        if (mapAsset?.type === "asset") mapAsset.source = chunk.map.toString();
      }
    },
  },
});
