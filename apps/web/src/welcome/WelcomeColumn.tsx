import type { DeviceKind } from "@streets/core/view/device-kind";
import {
  type Component,
  type ParentComponent,
  Show,
  createContext,
  useContext,
} from "solid-js";
import type { ConnectAttempt } from "../session";
import JunctionArt from "./JunctionArt";
import LoginPanel, { type LoginState, type LoginStep } from "./LoginPanel";

/** 紹介のカラムからログインするための口。ログインしていない画面のデッキが渡す。 */
export type WelcomeLogin = {
  state: () => LoginState;
  onExtension: () => void;
  onNosskey: () => void;
  onBunker: (uri: string) => void;
  onNostrConnect: () => ConnectAttempt;
  onRetryRestore: () => void;
};

const WelcomeLoginContext = createContext<WelcomeLogin>();

export const WelcomeLoginProvider: ParentComponent<{ value: WelcomeLogin }> = (
  props,
) => (
  <WelcomeLoginContext.Provider value={props.value}>
    {props.children}
  </WelcomeLoginContext.Provider>
);

type WelcomeColumnViewProps = WelcomeLogin & {
  initialStep?: LoginStep;
  initialRemoteOpen?: boolean;
  initialDevice?: DeviceKind;
  initialBunkerUri?: string;
};

/** 紹介とログインのカラムの中身。頭にロゴの道を敷き、その下で始め方を選ぶ。 */
export const WelcomeColumnView: Component<WelcomeColumnViewProps> = (props) => (
  <div class="flex flex-col">
    <div class="relative h-36 shrink-0 overflow-hidden">
      <JunctionArt class="absolute inset-0 size-full" />
      <div class="absolute inset-x-4 bottom-3 flex items-center gap-3 c-white">
        {/* ロゴの紫は夜の色に沈むので、白い台に載せる。 */}
        <span class="grid size-14 place-items-center rounded-3 bg-white">
          <img src="/favicon.svg" alt="" class="size-10" />
        </span>
        <p class="font-700 text-[36px] leading-none">Streets</p>
      </div>
    </div>
    <div class="p-4">
      <LoginPanel
        state={props.state()}
        onExtension={props.onExtension}
        onNosskey={props.onNosskey}
        onBunker={props.onBunker}
        onNostrConnect={props.onNostrConnect}
        onRetryRestore={props.onRetryRestore}
        initialStep={props.initialStep}
        initialRemoteOpen={props.initialRemoteOpen}
        initialDevice={props.initialDevice}
        initialBunkerUri={props.initialBunkerUri}
      />
    </div>
  </div>
);

/** 紹介とログインのカラム。ログインしている画面では、もう用が無いことだけを出す。 */
const WelcomeColumn: Component = () => {
  const login = useContext(WelcomeLoginContext);
  return (
    <Show
      when={login}
      fallback={
        <p class="c-secondary p-4 text-caption">
          ログインしています。このカラムは外して構いません。
        </p>
      }
    >
      {(login) => <WelcomeColumnView {...login()} />}
    </Show>
  );
};

export default WelcomeColumn;
