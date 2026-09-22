import { Collapsible } from "@ark-ui/solid/collapsible";
import { type Component, Match, Show, Switch, createSignal } from "solid-js";
import ChoiceButton from "../ui/ChoiceButton";
import BunkerForm from "./BunkerForm";
import { GUIDE, GuideLink } from "./guide";

export type LoginState = {
  pending: boolean;
  error?: string;
  /** 署名器が承認のために開いてほしいページ。 */
  authUrl?: URL;
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
  /** 最初に見せる段。ストーリーで各段を並べるため。 */
  initialStep?: LoginStep;
  /** 入力欄の最初の値。ストーリーで貼り付けた後の見た目を出すため。 */
  initialBunkerUri?: string;
}> = (props) => {
  // 復元に失敗して戻ってきた人は、アカウントを持っている。
  const [step, setStep] = createSignal<LoginStep>(
    props.initialStep ?? (props.state.error ? "existing" : "choose"),
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
          <p class="text-caption">
            Nostr
            のアカウントは、鍵を預かる拡張機能か署名器のアプリで作ります。Streets
            は鍵を預からず、署名をそれらに頼みます。
          </p>
          <p class="text-caption">
            <GuideLink href={GUIDE}>Nostr のはじめかた</GuideLink>
          </p>
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
              <p
                role="alert"
                class="c-danger rounded-2 bg-danger-subtle px-3 py-2 text-caption"
              >
                {message()}
              </p>
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
            defaultOpen={props.initialBunkerUri !== undefined}
            class="flex flex-col gap-2"
          >
            <Collapsible.Trigger
              asChild={(trigger) => (
                <ChoiceButton
                  {...trigger()}
                  icon="i-material-symbols:phonelink-lock-outline-rounded"
                  title="リモート署名器でログイン"
                  description="Amber など、鍵を預かる別のアプリに署名を頼みます"
                  trailing="expand"
                />
              )}
            />
            <Collapsible.Content class="motion-collapse">
              <div class="pt-1">
                <BunkerForm
                  pending={props.state.pending}
                  onBunker={props.onBunker}
                  initialValue={props.initialBunkerUri}
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
