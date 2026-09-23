import { Collapsible } from "@ark-ui/solid/collapsible";
import { type DeviceKind, deviceKind } from "@streets/core/view/device-kind";
import {
  type Component,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  on,
} from "solid-js";
import type { ConnectAttempt } from "../session";
import Button from "../ui/Button";
import ChoiceButton from "../ui/ChoiceButton";
import NewcomerGuide from "./NewcomerGuide";
import RemoteSignerLogin from "./RemoteSignerLogin";

export type LoginState = {
  pending: boolean;
  error?: string;
  /** 署名器が承認のために開いてほしいページ。 */
  authUrl?: URL;
  /** 保存したログインを戻せなかった。署名器が戻れば試し直せる。 */
  restoreFailed?: boolean;
};

export type LoginStep = "choose" | "new" | "existing";

const BackButton: Component<{ onClick: () => void }> = (props) => (
  <button
    type="button"
    class="c-secondary -ml-1 flex w-fit cursor-pointer items-center gap-1 rounded-1.5 bg-transparent px-1 py-0.5 text-caption hover:bg-secondary"
    onClick={() => props.onClick()}
  >
    <span
      class="i-material-symbols:arrow-back-rounded size-4"
      aria-hidden="true"
    />
    戻る
  </button>
);

/**
 * 入口の左側。はじめての方か、アカウントを持っている方かを先に選んでもらい、
 * それぞれに要るものだけを見せる。
 */
const LoginPanel: Component<{
  state: LoginState;
  onExtension: () => void;
  onBunker: (uri: string) => void;
  onRetryRestore: () => void;
  /** 署名器の側から繋いでもらう。QR を出している間だけ待つ。 */
  onNostrConnect: () => ConnectAttempt;
  /** 最初に見せる段。ストーリーで各段を並べるため。 */
  initialStep?: LoginStep;
  /** リモート署名器の欄を開いた状態で始める。ストーリーで QR を見せるため。 */
  initialRemoteOpen?: boolean;
  /** はじめての方に最初に見せる端末。省くと実際の端末から推す。 */
  initialDevice?: DeviceKind;
  /** 入力欄の最初の値。ストーリーで貼り付けた後の見た目を出すため。 */
  initialBunkerUri?: string;
}> = (props) => {
  // スマートフォンで始め方を読み終えた人は、リモート署名器で繋ぐ。
  const [remoteOpen, setRemoteOpen] = createSignal(
    props.initialRemoteOpen === true || props.initialBunkerUri !== undefined,
  );
  const [step, setStep] = createSignal<LoginStep>(
    props.initialStep ?? "choose",
  );
  // 失敗はアカウントを持っている方の段にだけ出す。復元の失敗はこの画面が出た後に
  // 届くので、届いたときにその段へ移る。
  createEffect(
    on(
      () => props.state.error,
      (error) => {
        if (error && step() === "choose") setStep("existing");
      },
    ),
  );

  return (
    <Switch>
      <Match when={step() === "choose"}>
        <section
          class="flex animate-fade-in flex-col gap-3"
          aria-labelledby="choose-heading"
        >
          <h2 id="choose-heading" class="font-600 text-body">
            はじめる
          </h2>
          <ChoiceButton
            icon="i-material-symbols:person-add-outline-rounded"
            title="はじめての方"
            description="Nostr のアカウントを作るところから案内します"
            trailing="next"
            onClick={() => setStep("new")}
          />
          <ChoiceButton
            icon="i-material-symbols:login-rounded"
            title="Nostr のアカウントを持っている方"
            description="拡張機能かリモート署名器でログインします"
            trailing="next"
            onClick={() => setStep("existing")}
          />
        </section>
      </Match>

      <Match when={step() === "new"}>
        <section
          class="flex animate-fade-in flex-col gap-3"
          aria-labelledby="new-heading"
        >
          <BackButton onClick={() => setStep("choose")} />
          <h2 id="new-heading" class="font-600 text-body">
            はじめての方
          </h2>
          <NewcomerGuide
            initialDevice={
              props.initialDevice ??
              deviceKind(navigator.userAgent, navigator.maxTouchPoints)
            }
            onDone={(device) => {
              setRemoteOpen(device !== "pc");
              setStep("existing");
            }}
          />
        </section>
      </Match>

      <Match when={step() === "existing"}>
        <section
          class="flex animate-fade-in flex-col gap-3"
          aria-labelledby="existing-heading"
        >
          <BackButton onClick={() => setStep("choose")} />
          <h2 id="existing-heading" class="font-600 text-body">
            Nostr のアカウントを持っている方
          </h2>

          <Show when={props.state.error}>
            {(message) => (
              <div
                role="alert"
                class="flex flex-col items-start gap-2 rounded-2 bg-danger-subtle px-3 py-2"
              >
                <p class="c-danger text-caption">{message()}</p>
                <Show when={props.state.restoreFailed}>
                  <Button
                    size="sm"
                    icon="i-material-symbols:refresh-rounded"
                    disabled={props.state.pending}
                    onClick={() => props.onRetryRestore()}
                  >
                    もう一度試す
                  </Button>
                </Show>
              </div>
            )}
          </Show>

          <ChoiceButton
            icon="i-material-symbols:extension-outline-rounded"
            title="拡張機能でログイン"
            description="nos2x や Alby など、ブラウザの拡張機能に署名を頼みます"
            disabled={props.state.pending}
            onClick={() => props.onExtension()}
          />

          <Collapsible.Root
            lazyMount
            unmountOnExit
            defaultOpen={remoteOpen()}
            class="flex flex-col gap-2"
          >
            <Collapsible.Trigger
              asChild={(trigger) => (
                <ChoiceButton
                  {...trigger()}
                  icon="i-material-symbols:phonelink-lock-outline-rounded"
                  title="リモート署名器でログイン"
                  description="Amber や Primal など、鍵を預かる別のアプリに署名を頼みます"
                  trailing="expand"
                />
              )}
            />
            <Collapsible.Content class="motion-collapse">
              <div class="pt-1">
                <RemoteSignerLogin
                  pending={props.state.pending}
                  onBunker={props.onBunker}
                  onNostrConnect={props.onNostrConnect}
                  initialBunkerUri={props.initialBunkerUri}
                />
              </div>
            </Collapsible.Content>
          </Collapsible.Root>

          <Show when={props.state.authUrl}>
            {(url) => (
              <a
                class="text-caption text-link"
                href={url().href}
                target="_blank"
                rel="noopener noreferrer"
              >
                署名器で接続を承認する
              </a>
            )}
          </Show>
        </section>
      </Match>
    </Switch>
  );
};

export default LoginPanel;
