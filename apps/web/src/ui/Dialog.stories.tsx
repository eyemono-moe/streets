import type { Meta, StoryObj } from "storybook-solidjs-vite";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "./Dialog";

const Story = (props: { long: boolean; footer: boolean }) => (
  <DialogRoot open onClose={() => {}}>
    <DialogPortal>
      <DialogContent class="w-full max-w-130 rounded-3 border border-primary">
        <div class="flex min-h-12 shrink-0 items-start gap-2 py-3 pr-3 pl-4">
          <DialogTitle class="break-anywhere min-w-0 flex-1 font-600 text-body">
            {props.long
              ? "とても長いダイアログのタイトル".repeat(8)
              : "ダイアログ"}
          </DialogTitle>
          <DialogClose />
        </div>
        <DialogBody class="whitespace-pre-line px-4 pb-4">
          {props.long ? "長い内容です。\n".repeat(100) : "内容です。"}
        </DialogBody>
        {props.footer && (
          <div class="shrink-0 border-primary border-t p-3">フッター</div>
        )}
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
);

const meta = {
  title: "UI/Dialog",
  component: Story,
  args: { long: false, footer: true },
} satisfies Meta<typeof Story>;
export default meta;
type S = StoryObj<typeof meta>;
export const 通常: S = {};
export const 長い内容: S = { args: { long: true } };
export const フッターなし: S = { args: { footer: false } };
export const 狭い画面: S = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
