import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import AboutDialog from "../about/AboutDialog";
import { Mediates } from "../ui-events";
import type { LoginState } from "./LoginPanel";
import { WelcomeColumnView } from "./WelcomeColumn";

type Props = Omit<Parameters<typeof WelcomeColumnView>[0], "state"> & {
  login: LoginState;
  /** カラムの幅。狭い画面では画面いっぱいになる。 */
  width: string;
};

const meta = {
  title: "カラム/紹介とログイン",
  component: (props: Props) => {
    const [about, setAbout] = createSignal(false);
    return (
      <Mediates
        handle={(event) => {
          if (event.type === "deck/open-about") setAbout(true);
          else if (event.type === "deck/close-about") setAbout(false);
          else return false;
          return true;
        }}
      >
        <div
          class="h-dvh overflow-y-auto border-primary border-r bg-primary"
          style={{ width: props.width }}
        >
          <WelcomeColumnView {...props} state={() => props.login} />
        </div>
        <AboutDialog open={about()} wide />
      </Mediates>
    );
  },
  args: {
    width: "380px",
    login: { pending: false },
    onExtension: () => {},
    onBunker: () => {},
    onRetryRestore: () => {},
    onNostrConnect: () => ({
      uri: `nostrconnect://${"a".repeat(64)}?relay=wss%3A%2F%2Fnos.lol%2F&secret=0123456789abcdef&name=Streets`,
      // ストーリーでは承認されないまま待ち続ける。
      done: new Promise<void>(() => {}),
      cancel: () => {},
    }),
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 最初の二択: Story = {};

export const 幅の狭いカラム: Story = { args: { width: "320px" } };

export const 狭い画面: Story = {
  args: { width: "100%" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const はじめての方_Android: Story = {
  args: { initialStep: "new", initialDevice: "android" },
};

export const はじめての方_iPhone: Story = {
  args: { initialStep: "new", initialDevice: "ios" },
};

export const はじめての方_パソコン: Story = {
  args: { initialStep: "new", initialDevice: "pc" },
};

export const アカウントを持っている方: Story = {
  args: { initialStep: "existing" },
};

export const QRコードで繋ぐ: Story = {
  args: { initialStep: "existing", initialRemoteOpen: true },
};

export const ログインしている途中: Story = {
  args: { initialStep: "existing", login: { pending: true } },
};

export const 署名器の承認待ち: Story = {
  args: {
    initialStep: "existing",
    login: {
      pending: true,
      authUrl: new URL("https://signer.example/approve?token=abc"),
    },
  },
};

export const ログインできなかった: Story = {
  args: {
    login: {
      pending: false,
      error: "NIP-07 対応の拡張機能が見つかりません。",
    },
  },
};

export const ログインを戻せなかった: Story = {
  args: {
    login: {
      pending: false,
      error:
        "署名器と繋がりませんでした。署名器のアプリが動いているか確かめて、もう一度試してください。",
      restoreFailed: true,
    },
  },
};

export const 秘密鍵を貼り付けた: Story = {
  args: {
    initialStep: "existing",
    initialBunkerUri: `nsec1${"q".repeat(58)}`,
  },
};

export const 署名器と繋がらなかった: Story = {
  args: {
    initialStep: "existing",
    initialRemoteOpen: true,
    onNostrConnect: () => ({
      uri: `nostrconnect://${"a".repeat(64)}`,
      done: Promise.reject(new Error("remote signer did not connect in time")),
      cancel: () => {},
    }),
  },
};
