import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import AboutDialog from "./AboutDialog";

type Props = { wide: boolean };

const meta = {
  title: "設定/Streets について",
  component: (props: Props) => (
    // 閉じる操作はデッキが裁定する。ここでは受け取って捨てる。
    <Mediates handle={(event) => event.type === "deck/close-about"}>
      <AboutDialog open wide={props.wide} />
    </Mediates>
  ),
  args: { wide: true },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 広い画面: S = {};

export const 狭い画面: S = { args: { wide: false } };
