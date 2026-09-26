import {
  type FollowSetFormState,
  closedFollowSetForm,
  followSetFormTransition,
} from "@streets/core/lists/follow-set-form";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { UploaderProvider } from "../media/uploader";
import { Mediates } from "../ui-events";
import FollowSetFormDialog from "./FollowSetFormDialog";
import { storySets } from "./story-lists";

const run = (...events: Parameters<typeof followSetFormTransition>[1][]) =>
  events.reduce(followSetFormTransition, closedFollowSetForm());

const creating = run({ type: "follow-set-form/open-create" });
const named = followSetFormTransition(creating, {
  type: "follow-set-form/input",
  field: "title",
  value: "よく話す人",
});

// 実際には上げず、少し待ってから決まった URL を返す。
const uploader = {
  servers: () => ["https://blossom.example/"],
  upload: async (file: File) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      url: `https://example.invalid/${file.name}`,
      sha256: "0".repeat(64),
      size: file.size,
    };
  },
};

type Props = { form: FollowSetFormState };

const meta = {
  title: "リスト/リストを作る・直す",
  component: (props: Props) => (
    // 裁定する段は置かない。押しても何も起きない、見た目だけのカタログ。
    <Mediates handle={() => true}>
      <UploaderProvider value={uploader as never}>
        <FollowSetFormDialog form={props.form} />
      </UploaderProvider>
    </Mediates>
  ),
  args: { form: creating },
  argTypes: { form: { control: false } },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 作る: Story = {};
export const 名前を書いた: Story = { args: { form: named } };
export const 書きかけのまま閉じようとした: Story = {
  args: {
    form: followSetFormTransition(named, { type: "follow-set-form/close" }),
  },
};
export const 送っている: Story = {
  args: {
    form: followSetFormTransition(named, { type: "follow-set-form/submit" }),
  },
};
export const 直す: Story = {
  args: {
    form: run({ type: "follow-set-form/open-edit", set: storySets[0]! }),
  },
};
