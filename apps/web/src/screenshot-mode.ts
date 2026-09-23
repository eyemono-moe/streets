/**
 * 宣伝用のスクリーンショットを撮っているか（開発時に `?screenshot` を付けて開いた）。
 * 開発用のパネルや使い方の案内を写さないために使う。本番では常に false。
 */
export const screenshotMode = (): boolean =>
  import.meta.env.DEV && new URLSearchParams(location.search).has("screenshot");
