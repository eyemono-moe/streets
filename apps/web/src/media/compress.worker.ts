import { type CompressRequest, compressImage } from "./compress";

/** 画像の描き直しを画面の外で行う。送信ボタンを押した後に画面が固まらないように。 */
self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  try {
    self.postMessage({ ok: true, result: await compressImage(event.data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
