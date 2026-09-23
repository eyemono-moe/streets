import type { NostrEvent } from "@streets/core/nostr/event";
import { type Component, For, Show } from "solid-js";
import { useReadLayer } from "../read-layer";
import { notifyError, notifySuccess } from "../toast";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";

/** 投稿の素の中身と、どのリレーから受け取ったか。 */
const EventDetailsDialog: Component<{
  event: NostrEvent;
  onClose: () => void;
}> = (props) => {
  const { store } = useReadLayer();
  const json = () => JSON.stringify(props.event, null, 2);
  // "local" は自分が書いて手元へ入れた印で、実在のリレーではない。
  const relays = () => store.seenRelays(props.event.id);

  return (
    <DialogRoot open onClose={props.onClose}>
      <DialogPortal>
        <DialogContent class="flex max-h-[80vh] w-full max-w-130 flex-col rounded-3 border border-primary">
          <div class="flex h-12 items-center gap-2 pr-3 pl-4">
            <DialogTitle class="flex-1 font-600 text-body">詳細</DialogTitle>
            <DialogClose />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <h3 class="c-secondary font-600 text-caption">受け取ったリレー</h3>
            <Show
              when={relays().length > 0}
              fallback={
                <p class="c-secondary text-caption">
                  このイベントを配信したリレーは記録されていません。
                </p>
              }
            >
              <ul class="text-caption">
                <For each={relays()}>
                  {(relay) => <li class="break-all">{relay}</li>}
                </For>
              </ul>
            </Show>

            <h3 class="c-secondary mt-3 font-600 text-caption">JSON</h3>
            <pre class="overflow-x-auto rounded-2 bg-secondary p-3 text-caption">
              {json()}
            </pre>
          </div>

          <div class="flex h-13 items-center gap-2 py-2.5 pr-3 pl-4">
            <span class="flex-1" />
            <button
              type="button"
              class="h-8.5 cursor-pointer rounded-full bg-accent-primary px-4.5 font-600 text-caption text-white hover:bg-accent-hover"
              onClick={() => {
                void navigator.clipboard
                  .writeText(json())
                  .then(() => notifySuccess("JSON をコピーしました"))
                  // 非セキュアな接続や権限拒否で失敗する。黙って終わらせない。
                  .catch((cause) =>
                    notifyError(cause, "JSON をコピーできませんでした"),
                  );
              }}
            >
              JSON をコピー
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default EventDetailsDialog;
