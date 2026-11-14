import { Toast } from "@ark-ui/solid/toast";
import { type Component, For, type JSX, Show } from "solid-js";
import Button from "../ui/Button";

export type AppletNoticeMeta = {
  appletNotice: {
    /** 出したアップレットの名前。システムの知らせと見分けられるように必ず出す。 */
    source: string;
    actions: readonly { id: string; label: string }[];
    onClick: () => void;
    onAction: (actionId: string) => void;
  };
};

/** アップレットが出した知らせ（NAP-NOTIFY）。本文を押すとアップレットに知らせる。 */
const AppletNoticeToast: Component<{
  meta: AppletNoticeMeta["appletNotice"];
  title: JSX.Element;
  description?: JSX.Element;
}> = (props) => (
  <div class="flex min-w-0 flex-col gap-1">
    <span class="c-secondary flex items-center gap-1 text-caption">
      <span
        class="i-material-symbols:widgets-outline-rounded size-3.5 shrink-0"
        aria-hidden="true"
      />
      <span class="min-w-0 truncate">{props.meta.source}</span>
    </span>
    <button
      type="button"
      class="flex min-w-0 cursor-pointer flex-col gap-1 border-0 bg-transparent p-0 text-left"
      onClick={() => props.meta.onClick()}
    >
      <Toast.Title class="c-primary break-anywhere font-600 text-body">
        {props.title}
      </Toast.Title>
      <Show when={props.description}>
        <Toast.Description class="c-secondary line-clamp-3 break-anywhere text-caption">
          {props.description}
        </Toast.Description>
      </Show>
    </button>
    <Show when={props.meta.actions.length > 0}>
      <div class="mt-1 flex flex-wrap gap-1.5">
        <For each={props.meta.actions}>
          {(action) => (
            <Button size="sm" onClick={() => props.meta.onAction(action.id)}>
              {action.label}
            </Button>
          )}
        </For>
      </div>
    </Show>
  </div>
);

export default AppletNoticeToast;
