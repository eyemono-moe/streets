import { QrCode } from "@ark-ui/solid/qr-code";
import { type Component, Match, Show, Switch } from "solid-js";
import { useAppWindow } from "../app-window";
import { t } from "../i18n/locale";
import { notifyError, notifySuccess } from "../toast";
import Button, { ButtonLink } from "../ui/Button";

export type NostrConnectStatus =
  | { phase: "waiting"; uri: string; resumed?: boolean }
  | { phase: "failed" };

/**
 * 署名器の側から繋いでもらう（`nostrconnect://`）。スマートフォンの署名器なら QR を
 * 読み、同じ端末ならリンクで開き、ほかは文字列をコピーして貼ってもらう。
 */
const NostrConnectView: Component<{
  status: NostrConnectStatus;
  onRetry: () => void;
}> = (props) => (
  <Switch>
    <Match when={props.status.phase === "waiting" && props.status}>
      {(status) => {
        const appWindow = useAppWindow();
        const copy = async () => {
          try {
            await appWindow.navigator.clipboard.writeText(status().uri);
            notifySuccess(t("welcome.connect.copied"));
          } catch (error) {
            notifyError(error, t("welcome.connect.copyFailed"));
          }
        };
        return (
          <div class="flex flex-col items-center gap-3">
            <QrCode.Root
              value={status().uri}
              encoding={{ ecc: "L" }}
              class="rounded-2 bg-white p-3"
            >
              <QrCode.Frame class="size-48 fill-black">
                <QrCode.Pattern />
              </QrCode.Frame>
            </QrCode.Root>
            <p class="c-secondary text-center text-caption" aria-live="polite">
              <Show
                when={status().resumed}
                fallback={t("welcome.connect.waiting")}
              >
                {t("welcome.connect.resumed")}
              </Show>
            </p>
            <div class="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                icon="i-material-symbols:content-copy-outline-rounded"
                onClick={() => void copy()}
              >
                {t("welcome.connect.copy")}
              </Button>
              <ButtonLink
                size="sm"
                icon="i-material-symbols:smartphone-outline"
                href={status().uri}
              >
                {t("welcome.connect.openHere")}
              </ButtonLink>
            </div>
          </div>
        );
      }}
    </Match>
    <Match when={props.status.phase === "failed"}>
      <div class="flex flex-col items-center gap-3 py-6">
        <p class="c-secondary text-center text-caption">
          {t("welcome.connect.failed")}
        </p>
        <Button
          size="sm"
          icon="i-material-symbols:refresh-rounded"
          onClick={() => props.onRetry()}
        >
          {t("welcome.connect.retry")}
        </Button>
      </div>
    </Match>
  </Switch>
);

export default NostrConnectView;
