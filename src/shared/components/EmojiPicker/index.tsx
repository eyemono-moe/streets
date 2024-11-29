import { lazy } from "solid-js";

export type Emoji = {
  name: string;
  shortcodes: string;
} & (
  | {
      native: string;
      src?: undefined;
    }
  | {
      native?: undefined;
      src: string;
    }
);

const EmojiPicker = lazy(() => import("./EmojiPicker"));

export default EmojiPicker;
