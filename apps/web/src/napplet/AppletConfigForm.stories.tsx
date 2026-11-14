import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import AppletConfigForm from "./AppletConfigForm";

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    theme: {
      type: "string",
      title: "配色",
      enum: ["light", "dark"],
      enumDescriptions: ["明るい", "暗い"],
      default: "dark",
      "x-napplet-section": "見た目",
      "x-napplet-order": 1,
    },
    font: {
      type: "string",
      title: "文字の大きさ",
      enum: ["xs", "s", "m", "l", "xl"],
      default: "m",
      "x-napplet-section": "見た目",
      "x-napplet-order": 2,
    },
    reposts: {
      type: "boolean",
      title: "リポストも並べる",
      default: true,
      "x-napplet-section": "流れ",
    },
    limit: {
      type: "integer",
      title: "一度に読む数",
      minimum: 10,
      maximum: 200,
      default: 50,
      description: "多いほど読み込みに時間がかかります。",
      "x-napplet-section": "流れ",
    },
    hashtags: {
      type: "array",
      title: "除くハッシュタグ",
      items: { type: "string" },
      maxItems: 10,
      "x-napplet-section": "流れ",
    },
    token: {
      type: "string",
      title: "API キー",
      "x-napplet-secret": true,
      deprecationMessage: "次の版で使わなくなります。",
      "x-napplet-section": "連携",
    },
  },
};

const Story = (props: { values: Record<string, unknown>; width: number }) => {
  const [values, setValues] = createSignal(props.values);
  return (
    <div class="bg-primary p-4" style={{ width: `${props.width}px` }}>
      <AppletConfigForm
        schema={schema}
        values={values()}
        onChange={(key, value) =>
          setValues((current) => {
            const { [key]: _, ...rest } = current;
            return value === undefined ? rest : { ...rest, [key]: value };
          })
        }
      />
    </div>
  );
};

const meta = {
  title: "カラム/アップレットの設定",
  component: Story,
  args: { values: {}, width: 340 },
} satisfies Meta<typeof Story>;

export default meta;
type S = StoryObj<typeof meta>;

/** 何も変えていない。既定の値で描く。 */
export const 既定のまま: S = {};

/** 変えてある項目には、名前の横に「既定に戻す」が出る。 */
export const 変えてある: S = {
  args: { values: { theme: "light", limit: 120, hashtags: ["spam", "ad"] } },
};

export const 狭いカラム: S = { args: { width: 240 } };
