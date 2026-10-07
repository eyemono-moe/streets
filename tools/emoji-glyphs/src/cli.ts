import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type FontId,
  encodeGlyph,
  shardName,
} from "@streets/core/emoji-maker/glyph-shard";
import opentype from "opentype.js";
import { charset, flatten } from "./flatten";

type Source = { url: string; sha256: string };

/**
 * 絵文字の `v1` が使うフォント。中身が変わると、同じ指定の絵文字の見た目が変わるので、
 * ファイルの SHA-256 で固定する。どれも SIL Open Font License 1.1 で、取り出した輪郭も
 * 同じライセンスで配る義務がある。ライセンスの全文も、google/fonts のコミットで固定して
 * 輪郭と一緒に書き出す。
 */
const GOOGLE_FONTS_COMMIT = "7085eb89a950e85db5b166b7a58d414544b4140c";
const license = (dir: string, sha256: string): Source => ({
  url: `https://raw.githubusercontent.com/google/fonts/${GOOGLE_FONTS_COMMIT}/ofl/${dir}/OFL.txt`,
  sha256,
});

const FONTS: Record<FontId, { name: string; font: Source; license: Source }> = {
  gothic: {
    name: "Noto Sans JP Black",
    font: {
      url: "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFLgk75s.ttf",
      sha256:
        "23525447937a108c74add284c92609103d478e44eed5e2f1997dee559ac4dea8",
    },
    license: license(
      "notosansjp",
      "1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9",
    ),
  },
  rounded: {
    name: "M PLUS Rounded 1c ExtraBold",
    font: {
      url: "https://fonts.gstatic.com/s/mplusrounded1c/v22/VdGBAYIAV6gnpUpoWwNkYvrugw9RuM0m4psK.ttf",
      sha256:
        "b239feed63f479929c584c4c297ae466253eac408d8748208bc69b9dd5ea81b6",
    },
    license: license(
      "roundedmplus1c",
      "67f64c5509e5151796599e3ad47c3131cbe0c80c4f9430b90236a1249c2eacc9",
    ),
  },
  serif: {
    name: "Noto Serif JP Black",
    font: {
      url: "https://fonts.gstatic.com/s/notoserifjp/v34/xn71YHs72GKoTvER4Gn3b5eMRtWGkp6o7MjQ2byYPebA.ttf",
      sha256:
        "a3fd0f60566a396232cd6113354109ea3008fe21c53c96a5dfaf3b4e5b6b99ed",
    },
    license: license(
      "notoserifjp",
      "5e0da210fb04058a8c0087985d2d456b931c2579811a49655721d3cf0c36b6d6",
    ),
  },
};

const EM = 1000;
const root = new URL("..", import.meta.url).pathname;
/** 画面とサーバーの両方が、アプリの静的ファイルとして読む。 */
const out =
  process.argv[2] ?? join(root, "../../apps/web/public/emoji-glyphs/v1");
const cacheDir = join(root, "fonts");

/** 取ってきて `fonts/` に置き、中身が固定したものと同じかを確かめる。 */
const download = async (source: Source, file: string) => {
  const path = join(cacheDir, file);
  if (!existsSync(path)) {
    mkdirSync(cacheDir, { recursive: true });
    const res = await fetch(source.url);
    if (!res.ok) {
      throw new Error(`${source.url} を取れませんでした（${res.status}）`);
    }
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== source.sha256) {
    throw new Error(
      `${source.url} の中身が固定したものと違います（${sha256}）`,
    );
  }
  return bytes;
};

const codePoints = charset();
rmSync(out, { recursive: true, force: true });
const notices: string[] = [];

for (const id of Object.keys(FONTS) as FontId[]) {
  const bytes = await download(FONTS[id].font, `${id}.ttf`);
  const font = opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const scale = EM / font.unitsPerEm;
  const shards = new Map<string, Uint8Array[]>();
  let missing = 0;
  for (const codePoint of codePoints) {
    const glyph = font.charToGlyph(String.fromCodePoint(codePoint));
    if (glyph.index === 0) {
      missing++;
      continue;
    }
    // opentype.js の getPath は y を下向きにして返す（基準線が 0）。
    const contours = flatten(glyph.getPath(0, 0, EM).commands);
    const xs = contours.flatMap((points) =>
      points.filter((_, i) => i % 2 === 0),
    );
    const ys = contours.flatMap((points) =>
      points.filter((_, i) => i % 2 === 1),
    );
    const box: [number, number, number, number] =
      contours.length === 0
        ? [0, 0, 0, 0]
        : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const name = shardName(codePoint);
    const list = shards.get(name) ?? [];
    list.push(
      encodeGlyph(codePoint, {
        advance: Math.round((glyph.advanceWidth ?? 0) * scale),
        box,
        contours,
      }),
    );
    shards.set(name, list);
  }
  const dir = join(out, id);
  mkdirSync(dir, { recursive: true });
  let size = 0;
  for (const [name, records] of shards) {
    const file = Buffer.concat(records);
    size += file.length;
    writeFileSync(join(dir, `${name}.bin`), file);
  }
  const licenseFile = `${id}/OFL.txt`;
  writeFileSync(
    join(out, licenseFile),
    await download(FONTS[id].license, `${id}-OFL.txt`),
  );
  notices.push(
    [
      `${id}/: ${FONTS[id].name}`,
      `  ${font.getEnglishName("copyright") ?? ""}`,
      `  元のフォント: ${FONTS[id].font.url}`,
      `  ライセンス: SIL Open Font License 1.1（全文は ${licenseFile}）`,
    ].join("\n"),
  );
  console.log(
    `${FONTS[id].name}: ${shards.size} ファイル、${(size / 1e6).toFixed(1)}MB、無い字 ${missing}`,
  );
}

writeFileSync(
  join(out, "NOTICE.txt"),
  [
    "このフォルダの文字の輪郭は、次のフォントから取り出し、曲線を折れ線に直して形を変えたもの（Modified Version）です。",
    "元のフォントと同じ SIL Open Font License 1.1 で配ります。フォントとして使える形ではなく、元のフォントの名前（Reserved Font Name を含む）では呼びません。",
    "",
    "The glyph outlines in this folder are a Modified Version of the fonts below (curves converted to polylines),",
    "distributed under the SIL Open Font License, Version 1.1. They do not use the original names or any Reserved Font Name.",
    "",
    ...notices,
    "",
  ].join("\n"),
);
console.log(`書き出し先: ${out}`);
