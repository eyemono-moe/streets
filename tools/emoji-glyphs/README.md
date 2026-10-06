# 絵文字の文字の輪郭

「カスタム絵文字を作る」で使う文字の輪郭を、フォントから取り出して書き出す。画面の見本もサーバーも、このファイルを読んで `@streets/core/emoji-maker` で描く。形は `packages/core/src/emoji-maker/glyph-shard.ts` に書いてある。

```sh
vp run @streets/emoji-glyphs#generate            # apps/web/public/emoji-glyphs/v1 に書き出す
vp run @streets/emoji-glyphs#generate -- <出力先>
```

書き出したものはリポジトリに入れ、アプリの静的ファイルとして配る（画面は取得し、Worker は `ASSETS` から読む）。

- フォントは `src/cli.ts` に URL と SHA-256 で固定してある。初回は取ってきて `fonts/` に置き、中身が違えば止まる
- 文字は JIS X 0208（第 1・第 2 水準・かな・記号）と ASCII。それ以外の字は描けない字として扱う
- M PLUS Rounded 1c には第 2 水準の漢字が無い。描くときにゴシックで補う
- 絵文字の `v1` はこの出力を前提に描く。フォント・取り出し方・形を変えると、同じ指定の絵文字の見た目が変わるので、変えるときは版を上げる。`src/output.test.ts` が v1 の中身のハッシュを照合し、変わったら落ちる
- **ライセンス**：どのフォントも SIL Open Font License 1.1 で、取り出した輪郭も同じライセンスで配る。書体ごとのライセンスの全文（`<書体>/OFL.txt`、google/fonts のコミットと SHA-256 で固定）と、元のフォント・著作権の表示（`NOTICE.txt`）を一緒に書き出す。フォントを足すときも必ず両方を書き出す
