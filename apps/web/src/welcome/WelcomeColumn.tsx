import type { DeckAppearance } from "@streets/core/deck/deck";
import type { DeviceKind } from "@streets/core/view/device-kind";
import {
  type Component,
  type ParentComponent,
  Show,
  createContext,
  useContext,
} from "solid-js";
import { isMultiColumn } from "../deck-layout-setting";
import type { ConnectAttempt } from "../session";
import type { ColorScheme } from "../theme";
import LoginPanel, { type LoginState, type LoginStep } from "./LoginPanel";
import WelcomeFeatures from "./WelcomeFeatures";

/** 紹介のカラムからログインするための口。ログインしていない画面のデッキが渡す。 */
export type WelcomeLogin = {
  state: () => LoginState;
  onExtension: () => void;
  onBunker: (uri: string) => void;
  onNostrConnect: () => ConnectAttempt;
  onRetryRestore: () => void;
};

/** 紹介のカラムが読むデッキの状態。ログインしている画面では `login` が無い。 */
export type WelcomeContextValue = {
  login: WelcomeLogin | undefined;
  scheme: () => ColorScheme;
  appearance: () => DeckAppearance;
};

const WelcomeContext = createContext<WelcomeContextValue>();

export const WelcomeProvider: ParentComponent<{
  value: WelcomeContextValue;
}> = (props) => (
  <WelcomeContext.Provider value={props.value}>
    {props.children}
  </WelcomeContext.Provider>
);

type WelcomeColumnViewProps = {
  login: WelcomeLogin | undefined;
  scheme: ColorScheme;
  appearance: DeckAppearance;
  keyboard: boolean;
  initialStep?: LoginStep;
  initialRemoteOpen?: boolean;
  initialDevice?: DeviceKind;
  initialBunkerUri?: string;
};

const Head: Component = () => (
  <header class="flex flex-col gap-4 p-4 pt-6">
    <p class="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" class="size-9" />
      <span class="font-700 text-[26px] leading-none">Streets</span>
    </p>
    <h1 class="font-700 text-[32px] leading-tight">See it your way.</h1>
    <p class="c-secondary text-body leading-relaxed">
      Streetsは、Nostrの投稿を読むためのアプリです。ホーム、通知、検索などをカラムにして、見たい順に並べられます。
    </p>
  </header>
);

/**
 * 紹介とログインのカラムの中身。Streets の紹介を兼ねるので、ログインしている人にも
 * 同じ紹介を見せ、始め方の選択肢だけを出さない。
 */
export const WelcomeColumnView: Component<WelcomeColumnViewProps> = (props) => {
  const features = () => (
    <WelcomeFeatures
      scheme={props.scheme}
      appearance={props.appearance}
      keyboard={props.keyboard}
    />
  );
  return (
    <div class="flex flex-col">
      <Head />
      <Show when={props.login} fallback={features()}>
        {(login) => (
          <LoginPanel
            state={login().state()}
            onExtension={login().onExtension}
            onBunker={login().onBunker}
            onNostrConnect={login().onNostrConnect}
            onRetryRestore={login().onRetryRestore}
            initialStep={props.initialStep}
            initialRemoteOpen={props.initialRemoteOpen}
            initialDevice={props.initialDevice}
            initialBunkerUri={props.initialBunkerUri}
          >
            {features()}
          </LoginPanel>
        )}
      </Show>
    </div>
  );
};

// 指で触る端末では、キーボードの操作を紹介しない。紹介のカラムはピクチャーインピクチャーへ
// 出せないので、元のタブの窓で調べてよい。
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

const WelcomeColumn: Component = () => {
  const welcome = useContext(WelcomeContext);
  return (
    <Show when={welcome}>
      {(welcome) => (
        <WelcomeColumnView
          login={welcome().login}
          scheme={welcome().scheme()}
          appearance={welcome().appearance()}
          keyboard={isMultiColumn() && finePointer}
        />
      )}
    </Show>
  );
};

export default WelcomeColumn;
