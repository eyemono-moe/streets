import type { BlossomServer } from "@streets/core/media/blossom";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import MediaSettingsView from "./MediaSettingsView";

type Args = { servers: BlossomServer[]; saving: boolean; width: number };

/** アプリでは MediaMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [servers, setServers] = createSignal(props.servers);
  return (
    <Mediates
      handle={(event) => {
        if (event.type === "media/add-server") {
          setServers((current) => [...current, event.url]);
          return true;
        }
        if (event.type === "media/remove-server") {
          setServers((current) => current.filter((s) => s !== event.url));
          return true;
        }
        return false;
      }}
    >
      <div class="bg-primary p-6" style={{ width: `${props.width}px` }}>
        <MediaSettingsView servers={servers()} saving={props.saving} />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/画像の預け先",
  component: Story,
  args: {
    servers: ["https://blossom.example", "https://backup.example"],
    saving: false,
    width: 660,
  },
  argTypes: { servers: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
export const まだ無い: S = { args: { servers: [] } };
export const 保存中: S = { args: { saving: true } };
export const 長い_URL: S = {
  args: {
    servers: [
      "https://very-long-subdomain-for-a-media-server.example-provider.com/blossom",
    ],
  },
};
export const 狭い幅: S = { args: { width: 360 } };
