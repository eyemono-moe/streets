import { QrCode } from "@ark-ui/solid/qr-code";
import { type Component, Match, Switch } from "solid-js";
import { notifyError, notifySuccess } from "../toast";
import Button, { ButtonLink } from "../ui/Button";

export type NostrConnectStatus =
  | { phase: "waiting"; uri: string }
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
        const copy = async () => {
          try {
            await navigator.clipboard.writeText(status().uri);
            notifySuccess("接続用の文字列をコピーしました");
          } catch (error) {
            notifyError(error, "コピーできませんでした");
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
              署名器のアプリで読み取り、承認してください。承認を待っています…
            </p>
            <div class="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                icon="i-material-symbols:content-copy-outline-rounded"
                onClick={() => void copy()}
              >
                コピー
              </Button>
              <ButtonLink
                size="sm"
                icon="i-material-symbols:smartphone-outline"
                href={status().uri}
              >
                この端末の署名器で開く
              </ButtonLink>
            </div>
          </div>
        );
      }}
    </Match>
    <Match when={props.status.phase === "failed"}>
      <div class="flex flex-col items-center gap-3 py-6">
        <p class="c-secondary text-center text-caption">
          署名器と繋がりませんでした。承認されないまま時間が経ったか、接続が切れました。
        </p>
        <Button
          size="sm"
          icon="i-material-symbols:refresh-rounded"
          onClick={() => props.onRetry()}
        >
          もう一度
        </Button>
      </div>
    </Match>
  </Switch>
);

export default NostrConnectView;
