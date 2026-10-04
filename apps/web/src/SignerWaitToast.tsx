import { Toast } from "@ark-ui/solid/toast";
import { type Component, For, Show } from "solid-js";
import { ButtonLink } from "./ui/Button";

/** 署名器の承認待ちのトーストが持つ中身。`toaster.update` で丸ごと差し替える。 */
export type SignerWaitToastMeta = {
  signerWait: {
    /** 待たせている依頼の名前（「投稿の署名を待っています」など）。 */
    messages: readonly string[];
    /** 署名器が開くよう求めた承認のページ。 */
    authUrl?: URL;
  };
};

const title = (meta: SignerWaitToastMeta["signerWait"]): string => {
  if (meta.authUrl) return "署名器での承認が必要です";
  const [only, ...rest] = meta.messages;
  if (only !== undefined && rest.length === 0) return only;
  return `署名器の承認を ${meta.messages.length} 件待っています`;
};

/** 署名器の承認待ち。画面は止めず、何を待っているかと、承認のページへの道だけを出す。 */
const SignerWaitToast: Component<{
  meta: SignerWaitToastMeta["signerWait"];
}> = (props) => (
  <div class="flex min-w-0 flex-col gap-1">
    <div class="flex items-center gap-2">
      <span
        class="i-material-symbols:progress-activity c-accent-5 size-4.5 shrink-0 animate-spin"
        aria-hidden="true"
      />
      <Toast.Title class="c-primary min-w-0 flex-1 font-600 text-body">
        {title(props.meta)}
      </Toast.Title>
    </div>
    <Show when={props.meta.messages.length > 1 || props.meta.authUrl}>
      <ul class="c-secondary flex flex-col gap-0.5 pl-6.5 text-caption">
        <For each={props.meta.messages}>{(message) => <li>{message}</li>}</For>
      </ul>
    </Show>
    <Toast.Description class="c-secondary pl-6.5 text-caption">
      署名器のアプリやウィンドウで確認してください
    </Toast.Description>
    <Show when={props.meta.authUrl}>
      {(url) => (
        <div class="pt-1 pl-6.5">
          <ButtonLink
            href={url().href}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            size="sm"
            trailingIcon="i-material-symbols:open-in-new-rounded"
          >
            署名器で承認する
          </ButtonLink>
        </div>
      )}
    </Show>
  </div>
);

export default SignerWaitToast;
