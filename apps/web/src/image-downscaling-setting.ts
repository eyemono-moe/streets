import {
  IMAGE_DOWNSCALING_STORAGE_KEY,
  loadImageDownscaling,
  saveImageDownscaling,
} from "@streets/core/settings/image-downscaling-setting";
import { createSignal } from "solid-js";

const read = (): boolean => {
  try {
    return loadImageDownscaling(
      localStorage.getItem(IMAGE_DOWNSCALING_STORAGE_KEY),
    );
  } catch {
    return true;
  }
};

const [imageDownscaling, setValue] = createSignal(read());

/** この端末で画像を表示サイズに縮めるか。 */
export { imageDownscaling };

export const setImageDownscaling = (on: boolean) => {
  setValue(on);
  try {
    localStorage.setItem(
      IMAGE_DOWNSCALING_STORAGE_KEY,
      saveImageDownscaling(on),
    );
  } catch {
    // 保存できなくても、今の画面には当てる。
  }
};
