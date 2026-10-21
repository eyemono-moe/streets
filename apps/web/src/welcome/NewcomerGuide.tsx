import type { DeviceKind } from "@streets/core/view/device-kind";
import {
  type Component,
  For,
  Match,
  type ParentComponent,
  Switch,
  createSignal,
} from "solid-js";
import { t } from "../i18n/locale";
import ChoiceButton from "../ui/ChoiceButton";
import SegmentedControl from "../ui/SegmentedControl";
import { GUIDE, GuideLink } from "./guide";

const PRIMAL_ANDROID =
  "https://play.google.com/store/apps/details?id=net.primal.android";
const PRIMAL_IOS = "https://apps.apple.com/app/primal/id1673134518";
const AMBER = "https://github.com/greenart7c3/Amber/releases";
const NOS2X_CHROME =
  "https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp";
const NOS2X_FIREFOX = "https://addons.mozilla.org/firefox/addon/nos2x-fox/";
const ALBY_CHROME =
  "https://chromewebstore.google.com/detail/alby-bitcoin-wallet-for-l/iokeahhehimjnekafflcihljlcjccdbe";

/** 手順の 1 段。番号は `<ol>` の中の順から振る。 */
const Step: ParentComponent = (props) => (
  <li class="before:c-white flex gap-2.5 text-caption [counter-increment:step] before:grid before:size-5 before:shrink-0 before:place-items-center before:rounded-full before:bg-accent-primary before:font-600 before:text-[11px] before:content-[counter(step)]">
    <div class="flex min-w-0 flex-col gap-1">{props.children}</div>
  </li>
);

const Steps: ParentComponent = (props) => (
  <ol class="flex flex-col gap-3 [counter-reset:step]">{props.children}</ol>
);

const Links: Component<{ links: { href: string; label: string }[] }> = (
  props,
) => (
  <span class="flex flex-wrap gap-x-3 gap-y-1">
    <For each={props.links}>
      {(link) => <GuideLink href={link.href}>{link.label}</GuideLink>}
    </For>
  </span>
);

const RemoteLoginStep: Component = () => (
  <Step>
    <p>{t("welcome.newcomer.steps.remoteLogin")}</p>
  </Step>
);

/**
 * はじめての方に、端末ごとの始め方を出す。鍵は Streets では作らず、署名器の
 * アプリや拡張機能で作ってもらう（ADR-0008）。
 */
const NewcomerGuide: Component<{
  initialDevice: DeviceKind;
  /** アカウントを作り終えて、ログインへ進む。スマートフォンならリモート署名器を開いておく。 */
  onDone: (device: DeviceKind) => void;
}> = (props) => {
  const [device, setDevice] = createSignal(props.initialDevice);
  return (
    <div class="flex flex-col gap-4">
      <p class="text-caption">{t("welcome.newcomer.intro")}</p>
      <SegmentedControl
        label={t("welcome.newcomer.deviceLabel")}
        variant="secondary"
        block
        value={device()}
        onChange={setDevice}
        options={[
          {
            value: "android",
            label: "Android",
            icon: "i-material-symbols:android",
          },
          {
            value: "ios",
            label: "iPhone",
            icon: "i-material-symbols:phone-iphone-outline",
          },
          {
            value: "pc",
            label: t("welcome.newcomer.devices.pc"),
            icon: "i-material-symbols:computer-outline-rounded",
          },
        ]}
      />
      <Switch>
        <Match when={device() === "android"}>
          <Steps>
            <Step>
              <p>{t("welcome.newcomer.steps.getApp")}</p>
              <Links
                links={[
                  { href: PRIMAL_ANDROID, label: "Primal（Google Play）" },
                  { href: AMBER, label: "Amber（GitHub）" },
                ]}
              />
            </Step>
            <Step>
              <p>{t("welcome.newcomer.steps.createAccountInApp")}</p>
            </Step>
            <RemoteLoginStep />
          </Steps>
        </Match>
        <Match when={device() === "ios"}>
          <Steps>
            <Step>
              <p>{t("welcome.newcomer.steps.getApp")}</p>
              <Links
                links={[{ href: PRIMAL_IOS, label: "Primal（App Store）" }]}
              />
            </Step>
            <Step>
              <p>{t("welcome.newcomer.steps.createAccountInApp")}</p>
            </Step>
            <RemoteLoginStep />
          </Steps>
        </Match>
        <Match when={device() === "pc"}>
          <Steps>
            <Step>
              <p>{t("welcome.newcomer.steps.getExtension")}</p>
              <Links
                links={[
                  { href: NOS2X_CHROME, label: "nos2x（Chrome）" },
                  { href: NOS2X_FIREFOX, label: "nos2x（Firefox）" },
                  { href: ALBY_CHROME, label: "Alby（Chrome）" },
                ]}
              />
            </Step>
            <Step>
              <p>{t("welcome.newcomer.steps.createAccountInExtension")}</p>
            </Step>
            <Step>
              <p>{t("welcome.newcomer.steps.extensionLogin")}</p>
            </Step>
          </Steps>
          <p class="c-secondary text-caption">
            {t("welcome.newcomer.pcAlternative")}
          </p>
        </Match>
      </Switch>
      <p class="c-secondary text-caption">
        {t("welcome.newcomer.keyWarning")}
        <GuideLink href={GUIDE}>{t("welcome.newcomer.guide")}</GuideLink>
      </p>
      <ChoiceButton
        icon="i-material-symbols:login-rounded"
        title={t("welcome.newcomer.done")}
        trailing="next"
        onClick={() => props.onDone(device())}
      />
    </div>
  );
};

export default NewcomerGuide;
