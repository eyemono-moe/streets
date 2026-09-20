import { type Component, Show } from "solid-js";

const context = (): string =>
  [
    `Streets: ${import.meta.env.VITE_APP_VERSION || "unknown"}`,
    `Origin: ${window.location.origin}`,
    `Browser: ${navigator.userAgent}`,
  ].join("\n");

const resolveFeedbackUrl = (
  template: string | undefined,
): string | undefined => {
  if (!template) return undefined;
  try {
    const expanded = template
      .replaceAll("{context}", encodeURIComponent(context()))
      .replaceAll("%7Bcontext%7D", encodeURIComponent(context()));
    const url = new URL(expanded);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const FeedbackLink: Component<{
  /** Storybookでは実際のフォームを開かないURLを注入する。nullなら未設定状態。 */
  template?: string | null;
  size: "sidebar" | "tab";
}> = (props) => {
  const template = () =>
    props.template === null
      ? undefined
      : (props.template ?? import.meta.env.VITE_FEEDBACK_URL);
  const href = () => resolveFeedbackUrl(template());
  const className = () =>
    props.size === "sidebar"
      ? "c-secondary grid size-10 shrink-0 place-items-center rounded-2 bg-transparent hover:bg-secondary"
      : "c-secondary grid h-11 w-11 place-items-center bg-transparent";

  return (
    <Show
      when={href()}
      fallback={
        <span
          aria-label="フィードバック（送信先が未設定）"
          title="フィードバック送信先が未設定です"
          class={`${className()} opacity-40`}
        >
          <span class="sr-only">フィードバックを送る</span>
          <span
            class="i-material-symbols:feedback-outline-rounded size-5.5"
            aria-hidden="true"
          />
        </span>
      }
    >
      {(url) => (
        <a
          href={url()}
          target="_blank"
          rel="noreferrer"
          aria-label="フィードバックを送る"
          title="フィードバックを送る"
          class={`${className()} cursor-pointer`}
        >
          <span class="sr-only">フィードバックを送る</span>
          <span
            class="i-material-symbols:feedback-outline-rounded size-5.5"
            aria-hidden="true"
          />
        </a>
      )}
    </Show>
  );
};

export default FeedbackLink;
