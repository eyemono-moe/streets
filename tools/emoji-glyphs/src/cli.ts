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

/**
 * 絵文字の `v1` が使うフォント。中身が変わると、同じ指定の絵文字の見た目が変わるので、
 * ファイルの SHA-256 で固定する。どれも SIL Open Font License 1.1。
 */
const FONTS: Record<FontId, { name: string; url: string; sha256: string }> = {
  gothic: {
    name: "Noto Sans JP Black",
    url: "https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFLgk75s.ttf",
    sha256: "23525447937a108c74add284c92609103d478e44eed5e2f1997dee559ac4dea8",
  },
  rounded: {
    name: "M PLUS Rounded 1c ExtraBold",
    url: "https://fonts.gstatic.com/s/mplusrounded1c/v22/VdGBAYIAV6gnpUpoWwNkYvrugw9RuM0m4psK.ttf",
    sha256: "b239feed63f479929c584c4c297ae466253eac408d8748208bc69b9dd5ea81b6",
  },
  serif: {
    name: "Noto Serif JP Black",
    url: "https://fonts.gstatic.com/s/notoserifjp/v34/xn71YHs72GKoTvER4Gn3b5eMRtWGkp6o7MjQ2byYPebA.ttf",
    sha256: "a3fd0f60566a396232cd6113354109ea3008fe21c53c96a5dfaf3b4e5b6b99ed",
  },
};

const EM = 1000;
const root = new URL("..", import.meta.url).pathname;
const out = process.argv[2] ?? join(root, "out");
const cacheDir = join(root, "fonts");

const loadFont = async (id: FontId) => {
  const font = FONTS[id];
  const path = join(cacheDir, `${id}.ttf`);
  if (!existsSync(path)) {
    mkdirSync(cacheDir, { recursive: true });
    const res = await fetch(font.url);
    if (!res.ok)
      throw new Error(`${font.name} を取れませんでした（${res.status}）`);
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  }
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== font.sha256) {
    throw new Error(`${font.name} の中身が固定したものと違います（${sha256}）`);
  }
  return opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
};

const codePoints = charset();
rmSync(out, { recursive: true, force: true });
const notices: string[] = [];

for (const id of Object.keys(FONTS) as FontId[]) {
  const font = await loadFont(id);
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
  let bytes = 0;
  for (const [name, records] of shards) {
    const file = Buffer.concat(records);
    bytes += file.length;
    writeFileSync(join(dir, `${name}.bin`), file);
  }
  const copyright = font.getEnglishName("copyright") ?? "";
  notices.push(`${FONTS[id].name}\n${copyright}\n${FONTS[id].url}\n`);
  console.log(
    `${FONTS[id].name}: ${shards.size} ファイル、${(bytes / 1e6).toFixed(1)}MB、無い字 ${missing}`,
  );
}

writeFileSync(
  join(out, "NOTICE.txt"),
  [
    "このフォルダの輪郭は、次のフォントから取り出したもの。どれも SIL Open Font License 1.1（https://openfontlicense.org）で配られている。",
    "",
    ...notices,
  ].join("\n"),
);
console.log(`書き出し先: ${out}`);
