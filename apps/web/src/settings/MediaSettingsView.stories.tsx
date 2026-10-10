import { DEFAULT_BLOSSOM_SERVERS } from "@streets/core/media/blossom";
import type { UploadServer } from "@streets/core/media/upload-servers";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Mediates } from "../ui-events";
import MediaSettingsView from "./MediaSettingsView";

const blossom = (url: string): UploadServer => ({ protocol: "blossom", url });

type Args = {
  servers: UploadServer[];
  saving: boolean;
  chosen: boolean;
  imageDownscaling: boolean;
  width: number;
};

/** アプリでは MediaMediator が裁定するイベントを、ここで手元の一覧に当てる。 */
const Story = (props: Args) => {
  const [servers, setServers] = createSignal(props.servers);
  const [imageDownscaling, setImageDownscaling] = createSignal(
    props.imageDownscaling,
  );
  return (
    <Mediates
      handle={(event) => {
        if (event.type === "media/add-server") {
          setServers((current) => [
            ...current,
            { protocol: "blossom", url: event.url },
          ]);
          return true;
        }
        if (event.type === "media/remove-server") {
          setServers((current) => current.filter((s) => s.url !== event.url));
          return true;
        }
        if (event.type === "deck/set-image-downscaling") {
          setImageDownscaling(event.on);
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
          imageDownscaling={imageDownscaling()}
        />
      </div>
    </Mediates>
  );
};

const meta = {
  title: "設定/画像",
  component: Story,
  args: {
    servers: [
      blossom("https://blossom.example"),
      blossom("https://backup.example"),
    ],
    saving: false,
    chosen: true,
    imageDownscaling: true,
    width: 660,
  },
  argTypes: { servers: { control: false } },
} satisfies Meta<Args>;

export default meta;
type S = StoryObj<typeof meta>;

export const いつもの: S = {};
export const 縮小を切ったとき: S = {
  args: { imageDownscaling: false },
};
/** まだ自分で選んでいない人。既定のアップロード先をそのまま使っている。 */
export const 既定のまま: S = {
  args: { chosen: false, servers: DEFAULT_BLOSSOM_SERVERS.map(blossom) },
};

/** 自分で全部外した人。画像を添えられない。 */
export const アップロード先が無い: S = { args: { servers: [] } };
export const 保存中: S = { args: { saving: true } };
export const 長い_URL: S = {
  args: {
    servers: [
      blossom(
        "https://very-long-subdomain-for-a-media-server.example-provider.com/blossom",
      ),
    ],
  },
};
export const 狭い幅: S = { args: { width: 360 } };

/** 古い方式（NIP-96）のアップロード先を足した人。Blossom の後ろに並ぶ。 */
export const NIP96_のアップロード先: S = {
  args: {
    servers: [
      blossom("https://blossom.band"),
      { protocol: "nip96", url: "https://nostr.build" },
    ],
  },
};

export const NIP96_のアップロード先_狭い幅: S = {
  args: { ...NIP96_のアップロード先.args, width: 360 },
};
