import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import AboutDialog from "./AboutDialog";

type Props = { wide: boolean; tour?: boolean };

const meta = {
  title: "設定/Streets について",
  component: (props: Props) => (
    // 閉じる操作はデッキが裁定する。ここでは受け取って捨てる。
    <Mediates
      handle={(event) =>
        event.type === "deck/close-about" || event.type === "deck/start-tour"
      }
    >
      <AboutDialog open wide={props.wide} tour={props.tour} />
    </Mediates>
  ),
  args: { wide: true },
  parameters: { viewport: { defaultViewport: "responsive" } },
} satisfies Meta<Props>;

export default meta;
type S = StoryObj<typeof meta>;

export const 広い画面: S = {};

export const 狭い画面: S = { args: { wide: false } };

/** ログインしてデッキから開いたとき。使い方の案内をもう一度始められる。 */
export const デッキから開いたとき: S = { args: { tour: true } };
