import {
  type FontId,
  type GlyphShard,
  decodeShard,
  shardName,
} from "@streets/core/emoji-maker/glyph-shard";
import { type GlyphLookup, shardsFor } from "@streets/core/emoji-maker/render";
import type { EmojiSpec } from "@streets/core/emoji-maker/spec";

const NO_SHARD: GlyphShard = { get: () => undefined };
/** 読んだ輪郭のファイル。同じファイルを二度取りに行かない。 */
const loading = new Map<string, Promise<GlyphShard>>();
const loaded = new Map<string, GlyphShard>();

const load = (font: FontId, name: string): Promise<GlyphShard> => {
  const id = `${font}/${name}`;
  let task = loading.get(id);
  if (!task) {
    task = fetch(`/emoji-glyphs/v1/${id}.bin`).then(
      async (res) => {
        // 無いファイルは、一枚の画面の index.html が 200 で返る。
        const type = res.headers.get("content-type") ?? "";
        const shard =
          res.ok && !type.includes("html")
            ? decodeShard(await res.arrayBuffer())
            : NO_SHARD;
        loaded.set(id, shard);
        return shard;
      },
      (cause: unknown) => {
        // 通信が切れただけなら、次に要るときにもう一度取りに行く。
        loading.delete(id);
        throw cause;
      },
    );
    loading.set(id, task);
  }
  return task;
};

const lookup: GlyphLookup = (font, codePoint) =>
  loaded.get(`${font}/${shardName(codePoint)}`)?.get(codePoint);

/** 描くのに要るファイルを読み、字を引けるようにする。 */
export const glyphsFor = async (spec: EmojiSpec): Promise<GlyphLookup> => {
  await Promise.all(shardsFor(spec).map(({ font, name }) => load(font, name)));
  return lookup;
};

/** ひらがなとカタカナ（U+3040〜U+30FF）。打つ言葉の多くは、これで描ける。 */
const KANA_FIRST = 0x3040;
const KANA_LAST = 0x30ff;
const FONTS: readonly FontId[] = ["gothic", "rounded", "serif"];

/**
 * かなの輪郭を先に読んでおく。ピッカーを開いた時点で呼び、打ったらすぐ候補が出るようにする。
 * 起動時には読まない（3 書体で約 270KB あり、作る機能を使わない人にも読ませることになる）。
 */
export const prefetchKana = () => {
  const names = new Set<string>();
  for (let cp = KANA_FIRST; cp <= KANA_LAST; cp += 64) names.add(shardName(cp));
  names.add(shardName(KANA_LAST));
  for (const font of FONTS) {
    for (const name of names) {
      load(font, name).catch(() => {
        // 読めなくても、描くときにもう一度取りに行く。
      });
    }
  }
};
