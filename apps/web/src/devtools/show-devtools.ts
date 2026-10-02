/**
 * TanStack Devtools を出すか。開発中と、Cloudflare のプレビュー URL で開いたときに出す。
 * タグのリリースはプレビューで確かめた版をそのまま本番に出すので、ビルドの設定では
 * 分けられず、開いている URL で見分ける。プレビューは `pr-12-streets.….workers.dev`
 * や `<版の ID>-streets.….workers.dev`、本番は `streets.eyemono.moe` と
 * `streets.….workers.dev`。
 */
export const showDevtools = (): boolean =>
  import.meta.env.DEV ||
  /^[^.]+-streets\.[^/]+\.workers\.dev$/.test(location.hostname);
