import type { DeckAppearance } from "@streets/core/deck/deck";
import { createSignal, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import AboutDialog from "../about/AboutDialog";
import {
  type ColorScheme,
  DEFAULT_APPEARANCE,
  applyColors,
  savedColorScheme,
  setColorScheme,
} from "../theme";
import { Mediates } from "../ui-events";
import type { LoginState } from "./LoginPanel";
import { type WelcomeLogin, WelcomeColumnView } from "./WelcomeColumn";

type Props = Omit<
  Parameters<typeof WelcomeColumnView>[0],
  "login" | "scheme" | "appearance"
> &
  Omit<WelcomeLogin, "state"> & {
    login: LoginState;
    /** ログインしている人の見た目にする（始め方の選択肢を出さない）。 */
    signedIn?: boolean;
    /** ログインを促され続ける（数秒ごとに揺れる）。 */
    nudging?: boolean;
    /** カラムの幅。狭い画面では画面いっぱいになる。 */
    width: string;
  };

const meta = {
  title: "カラム/紹介とログイン",
  component: (props: Props) => {
    const [about, setAbout] = createSignal<string | undefined>();
    // 色と明るさはデッキの段が持つ。ストーリーでは手元に持ち、選んだら画面に当てる。
    const [scheme, setScheme] = createSignal<ColorScheme>(savedColorScheme());
    const [appearance, setAppearance] =
      createSignal<DeckAppearance>(DEFAULT_APPEARANCE);
    const [nudgedAt, setNudgedAt] = createSignal<number>();
    onMount(() => {
      if (!props.nudging) return;
      const timer = setInterval(() => setNudgedAt(Date.now()), 2500);
      onCleanup(() => clearInterval(timer));
    });
    return (
      <Mediates
        handle={(event) => {
          switch (event.type) {
            case "deck/open-about":
              setAbout(event.page ?? "overview");
              return true;
            case "deck/close-about":
              setAbout(undefined);
              return true;
            case "deck/set-color-scheme":
              setScheme(event.scheme);
              setColorScheme(event.scheme, false);
              return true;
            case "deck/set-appearance":
              setAppearance(event.appearance);
              applyColors(event.appearance);
              return true;
            default:
              return false;
          }
        }}
      >
        <div
          class="h-dvh overflow-y-auto border-primary border-r bg-primary"
          style={{ width: props.width }}
        >
          <WelcomeColumnView
            {...props}
            scheme={scheme()}
            appearance={appearance()}
            loginNudgedAt={nudgedAt()}
            login={
              props.signedIn
                ? undefined
                : {
                    state: () => props.login,
                    onExtension: props.onExtension,
                    onBunker: props.onBunker,
                    onNostrConnect: props.onNostrConnect,
                    onRetryRestore: props.onRetryRestore,
                  }
            }
          />
        </div>
        <AboutDialog
          open={about() !== undefined}
          requestedPage={about()}
          wide
        />
      </Mediates>
    );
  },
  args: {
    width: "440px",
    keyboard: true,
    login: { pending: false },
    onExtension: () => {},
    onBunker: () => {},
    onRetryRestore: () => {},
    onNostrConnect: () => ({
      uri: `nostrconnect://${"a".repeat(64)}?relay=wss%3A%2F%2Fnos.lol%2F&secret=0123456789abcdef&name=Streets`,
      resumed: false,
      // ストーリーでは承認されないまま待ち続ける。
      done: new Promise<void>(() => {}),
      cancel: () => {},
    }),
  },
} satisfies Meta<Props>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 最初の画面: Story = {};

/** ログインの要る操作やメニューから促されると、始め方の欄に枠を付けて揺らす。 */
export const ログインを促された: Story = { args: { nudging: true } };

/** 途中の段で促されたときは、その段を揺らす。 */
export const 途中の段でログインを促された: Story = {
  args: { nudging: true, initialStep: "existing" },
};

/** ログインしている人にも同じ紹介を見せ、始め方の選択肢だけを出さない。 */
export const ログインしている: Story = { args: { signedIn: true } };

export const 幅の狭いカラム: Story = { args: { width: "320px" } };

export const 細いカラム: Story = { args: { width: "200px" } };

/** 狭い画面やタッチの端末では、キーボードの操作を紹介しない。 */
export const 狭い画面: Story = {
  args: { width: "100%", keyboard: false },
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
      resumed: false,
      done: Promise.reject(new Error("remote signer did not connect in time")),
      cancel: () => {},
    }),
  },
};
