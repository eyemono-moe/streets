import { lazy } from "solid-js";

export type Emoji = {
  id: string;
  keywords: undefined;
  name: string;
  shortcodes: string;
  unified?: string;
} & (
  | {
      native: string;
      src: undefined;
    }
  | {
      native: undefined;
      src: string;
    }
);

const EmojiPicker = lazy(() => import("./EmojiPicker"));

export default EmojiPicker;
