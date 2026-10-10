type DocumentPictureInPicture = {
  readonly window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
};

const api = (): DocumentPictureInPicture | undefined =>
  (window as { documentPictureInPicture?: DocumentPictureInPicture })
    .documentPictureInPicture;

/** Safari とモバイルのブラウザには無い。無ければ入口を出さない。 */
export const pipSupported = (): boolean => api() !== undefined;

/** このタブから開いたピクチャーインピクチャーが開いている。 */
export const pipOpen = (): boolean => (api()?.window ?? null) !== null;

/** カラム 1 本が収まる大きさ。ブラウザが画面に合わせて縮めることがある。 */
const SIZE = { width: 400, height: 720 };

// `cssRules` の `cssText` から組み直すと、Chrome は `var()` を含む `mask` の一括指定を
// 空の値で書き出し、アイコンが四角になる。要素ごと写す。
const copyStyles = (target: Document) => {
  for (const node of document.querySelectorAll(
    'style, link[rel="stylesheet"]',
  )) {
    target.head.append(node.cloneNode(true));
  }
};

/** テーマは `documentElement` の class と style に当ててあるので、写し続ける。 */
const mirrorTheme = (target: Document): (() => void) => {
  const sync = () => {
    target.documentElement.className = document.documentElement.className;
    target.documentElement.style.cssText =
      document.documentElement.style.cssText;
    target.body.className = document.body.className;
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
};

/**
 * ピクチャーインピクチャーを開く。押した操作の中で呼ぶ（そうでないとブラウザが断る）。
 * 開いているピクチャーインピクチャーがあれば、ブラウザがそれを閉じてから開く。
 */
export const openPipWindow = async (title: string): Promise<Window> => {
  const pip = api();
  if (!pip)
    throw new Error("このブラウザはピクチャーインピクチャーに対応していません");
  const win = await pip.requestWindow(SIZE);
  win.document.title = title;
  copyStyles(win.document);
  const stop = mirrorTheme(win.document);
  win.addEventListener("pagehide", stop, { once: true });
  return win;
};
