import { PRESETS, styleOfPreset } from "@streets/core/emoji-maker/style";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import MakerDialog, { MakerEditor } from "./MakerDialog";

const neon = PRESETS.find((preset) => preset.id === "neon") ?? PRESETS[0]!;

type Args = {
  initialText: string;
  width: number;
  initialShortcode?: string;
  initialRegister?: boolean;
};

/** ダイアログの中身。幅を変えて、見本の貼り付き方を見る。 */
const Editor = (props: Args) => (
  <div
    class="flex h-150 flex-col rounded-3 border border-primary bg-primary pt-4"
    style={{ width: `${props.width}px` }}
  >
    <MakerEditor
      initialText={props.initialText}
      initialStyle={styleOfPreset(neon)}
      presetId={neon.id}
      existingShortcodes={["neko1", "kome"]}
      initialShortcode={props.initialShortcode}
      initialRegister={props.initialRegister}
      onSend={() => {}}
      onRegister={() => {}}
      onBack={() => {}}
    />
  </div>
);

const meta = {
  title: "操作/カスタム絵文字を作る/調整のダイアログ",
  render: (args) => <Editor {...args} />,
  args: { initialText: "ええやん", width: 680 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const ふつう: S = {};

export const テキストが空: S = { args: { initialText: "" } };

export const 三字は左に寄せる: S = { args: { initialText: "えらい" } };

export const 長い言葉: S = { args: { initialText: "ありがとうございます" } };

export const 描けない文字がある: S = { args: { initialText: "🍣うまい" } };

export const 字数が多すぎる: S = { args: { initialText: "あ".repeat(13) } };

/** 自分の絵文字に登録する。送るボタンが「登録して送る」になり、「登録だけする」が並ぶ。 */
export const 自分の絵文字に登録する: S = {
  args: { initialRegister: true, initialShortcode: "eeyan" },
};

export const もうある名前: S = {
  args: { initialRegister: true, initialShortcode: "neko1" },
};

export const 使えない名前: S = { args: { initialShortcode: "ええやん" } };

/** 設定の「文字から作る」から開いたとき。送る先が無いので、登録だけをする。 */
export const 登録専用: S = {
  render: (args) => (
    <div
      class="flex h-150 flex-col rounded-3 border border-primary bg-primary pt-4"
      style={{ width: `${args.width}px` }}
    >
      <MakerEditor
        initialText={args.initialText}
        initialStyle={styleOfPreset(neon)}
        presetId={neon.id}
        existingShortcodes={["neko1", "kome"]}
        onRegister={() => {}}
        onBack={() => {}}
      />
    </div>
  ),
};

/** スマホの幅。見本は上に貼り付き、流しても残る。 */
export const 狭い画面: S = { args: { width: 360 } };

export const ダイアログ: S = {
  render: (args) => (
    <MakerDialog
      open
      initialText={args.initialText}
      initialStyle={styleOfPreset(neon)}
      presetId={neon.id}
      existingShortcodes={[]}
      onSend={() => {}}
      onRegister={() => {}}
      onClose={() => {}}
    />
  ),
};
