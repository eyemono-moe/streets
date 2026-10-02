import {
  type ActionArrangeState,
  type ActionLayout,
  defaultActionLayout,
} from "@streets/core/settings/action-layout";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import ActionLayoutField, { ActionLayoutView } from "./ActionLayoutField";

type Args = {
  layout: ActionLayout;
  width: number;
  /** 掴んでいる途中の見た目。渡すと動かせない。 */
  dragging?: ActionArrangeState["dragging"];
};

/** アプリでは DeckScreen が裁定するイベントを、ここで手元の並びに当てる。 */
const Story = (props: Args) => {
  const [layout, setLayout] = createSignal(props.layout);
  return (
    <Mediates
      handle={(event) => {
        if (event.type !== "deck/set-action-layout") return false;
        setLayout(event.layout);
        return true;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        {props.dragging ? (
          <Mediates handle={() => true}>
            <ActionLayoutView
              state={{ layout: layout(), dragging: props.dragging }}
            />
          </Mediates>
        ) : (
          <ActionLayoutField layout={layout()} />
        )}
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/アクション欄",
  render: (args) => <Story {...args} />,
  args: { layout: defaultActionLayout(), width: 560 },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<Args>;

export const 既定のまま: S = {};

export const 欄を減らしたあと: S = {
  args: {
    layout: {
      bar: ["reply", "like", "copy-link"],
      menu: [
        "repost",
        "react",
        "zap",
        "bookmark",
        "pin",
        "activity",
        "details",
        "mute-event",
        "broadcast",
      ],
    },
  },
};

export const 欄が空: S = {
  args: {
    layout: {
      bar: [],
      menu: [
        "reply",
        "repost",
        "like",
        "react",
        "zap",
        "bookmark",
        "pin",
        "activity",
        "copy-link",
        "details",
        "mute-event",
        "broadcast",
      ],
    },
  },
};

/** いっぱいの欄へメニューから入れる途中。欄の最後がメニューへ押し出されて見える。 */
export const いっぱいの欄へ入れている途中: S = {
  args: { dragging: { id: "copy-link", to: 1 } },
};

export const 狭い画面: S = { args: { width: 320 } };
