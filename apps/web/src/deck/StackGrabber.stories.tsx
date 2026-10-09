import { Drawer } from "@ark-ui/solid/drawer";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import StackGrabber from "./StackGrabber";

const meta = {
  title: "デッキ/重ねたカラムのハンドル",
  component: StackGrabber,
  decorators: [
    (Story) => (
      <div class="relative h-60 w-95 overflow-hidden bg-ui-100">
        <Drawer.Root open modal={false} trapFocus={false} swipeDirection="down">
          <Drawer.Positioner class="absolute inset-0">
            <Drawer.Content class="absolute inset-x-0 bottom-0 top-2 flex flex-col overflow-hidden rounded-t-3 border-primary border-t bg-primary outline-none">
              <Story />
              <div class="p-3 text-sm">見出しの行がここに続く</div>
            </Drawer.Content>
          </Drawer.Positioner>
        </Drawer.Root>
      </div>
    ),
  ],
} satisfies Meta<typeof StackGrabber>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 通常: Story = {};

export const 狭いカラム: Story = {
  parameters: { viewport: { defaultViewport: "column320" } },
};
