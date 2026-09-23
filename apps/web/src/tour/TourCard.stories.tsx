import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Button from "../ui/Button";
import { tourSteps } from "./DeckTour";
import TourCard from "./TourCard";

type Args = { wide: boolean; index: number };

const variantOf = (action: string | undefined) =>
  action === "skip" ? "ghost" : action === "prev" ? "secondary" : "primary";

/** 案内の各ステップのカード。指す場所や背景は、アプリで Ark UI の Tour が重ねる。 */
const Story = (props: Args) => {
  const steps = () => tourSteps(props.wide);
  const step = () => steps()[props.index] ?? steps()[0];
  return (
    <div class="bg-secondary p-6">
      <TourCard
        welcome={step()?.meta?.welcome === true}
        title={step()?.title}
        description={step()?.description}
        progress={
          step()?.meta?.welcome
            ? undefined
            : `${props.index + 1} / ${steps().length}`
        }
        actions={
          <For each={step()?.actions ?? []}>
            {(action) => (
              <Button
                size="sm"
                variant={variantOf(
                  typeof action.action === "string" ? action.action : undefined,
                )}
              >
                {action.label}
              </Button>
            )}
          </For>
        }
      />
    </div>
  );
};

const meta = {
  title: "操作/使い方の案内",
  component: Story,
  args: { wide: true, index: 0 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const ようこそ: S = {};
export const カラム: S = { args: { index: 1 } };
export const カラム_狭い画面: S = { args: { index: 1, wide: false } };
export const カラムを足す: S = { args: { index: 2 } };
export const 投稿する: S = { args: { index: 3 } };
export const 設定_最後: S = { args: { index: 4 } };
