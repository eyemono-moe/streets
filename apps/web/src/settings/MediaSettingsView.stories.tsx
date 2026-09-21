import {
  type BlossomServer,
  DEFAULT_BLOSSOM_SERVERS,
} from "@streets/core/media/blossom";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import MediaSettingsView from "./MediaSettingsView";

type Args = {
  servers: BlossomServer[];
  saving: boolean;
  chosen: boolean;
  width: number;
};

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
        <MediaSettingsView
          servers={servers()}
          saving={props.saving}
          chosen={props.chosen}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/画像のアップロード先",
  component: Story,
  args: {
    servers: ["https://blossom.example", "https://backup.example"],
    saving: false,
    chosen: true,
    width: 660,
  },
  argTypes: { servers: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
/** まだ自分で選んでいない人。既定のアップロード先をそのまま使っている。 */
export const 既定のまま: S = {
  args: { chosen: false, servers: [...DEFAULT_BLOSSOM_SERVERS] },
};

/** 自分で全部外した人。画像を添えられない。 */
export const アップロード先が無い: S = { args: { servers: [] } };
export const 保存中: S = { args: { saving: true } };
export const 長い_URL: S = {
  args: {
    servers: [
      "https://very-long-subdomain-for-a-media-server.example-provider.com/blossom",
    ],
  },
};
export const 狭い幅: S = { args: { width: 360 } };
