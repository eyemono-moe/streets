# 絵文字の文字の輪郭

「カスタム絵文字を作る」で使う文字の輪郭を、フォントから取り出して書き出す。画面の見本もサーバーも、このファイルを読んで `@streets/core/emoji-maker` で描く。形は `packages/core/src/emoji-maker/glyph-shard.ts` に書いてある。

```sh
vp run @streets/emoji-glyphs#generate            # tools/emoji-glyphs/out に書き出す
vp run @streets/emoji-glyphs#generate -- <出力先>
```

- フォントは `src/cli.ts` に URL と SHA-256 で固定してある。初回は取ってきて `fonts/` に置き、中身が違えば止まる
- 文字は JIS X 0208（第 1・第 2 水準・かな・記号）と ASCII。それ以外の字は描けない字として扱う
- M PLUS Rounded 1c には第 2 水準の漢字が無い。描くときにゴシックで補う
- 絵文字の `v1` はこの出力を前提に描く。フォント・取り出し方・形を変えると、同じ指定の絵文字の見た目が変わるので、変えるときは版を上げる
