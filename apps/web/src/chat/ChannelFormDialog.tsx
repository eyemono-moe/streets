import type { RelayListEntry } from "@streets/core/read/relay-list";
import {
  type ChannelFormState,
  canSubmitChannelForm,
  isChannelFormDirty,
} from "@streets/core/view/channel-form";
import { type Component, Show, createEffect, createSignal, on } from "solid-js";
import RelayColumnEditor from "../deck/RelayColumnEditor";
import ImageUrlField from "../media/ImageUrlField";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import StorageHint from "../ui/StorageHint";
import Switch from "../ui/Switch";
import TextField from "../ui/TextField";
import ChannelPicture from "./ChannelPicture";

/**
 * チャンネルを作る・直すダイアログ。状態は裁定する段（ChannelFormMediator）が持つ。
 * 書きかけのまま閉じようとしたら閉じず、ボタンの欄を揺らして知らせる。
 */
const ChannelFormDialog: Component<{
  form: ChannelFormState;
  account: readonly RelayListEntry[];
}> = (props) => {
  const dispatch = useDispatch();
  const editing = () =>
    props.form.phase === "closed" ? undefined : props.form;
  const [shaking, setShaking] = createSignal(false);
  // 画像を上げている間は送らせない。上げ終わる前に送ると、画像の無いチャンネルになる。
  const [uploading, setUploading] = createSignal(false);
  let actions: HTMLDivElement | undefined;
  createEffect(
    on(
      () => editing()?.blocked,
      (blocked) => {
        if (!blocked) return;
        setShaking(true);
        actions?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      },
    ),
  );

  return (
    <DialogRoot
      open={props.form.phase !== "closed"}
      onClose={() => dispatch({ type: "channel-form/close" })}
    >
      <DialogPortal>
        <DialogContent class="w-full max-w-120 rounded-3 border border-primary">
          <Show when={editing()}>
            {(form) => (
              <>
                <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
                  <DialogTitle class="flex-1 font-600 text-body">
                    {form().mode === "create"
                      ? "チャンネルを作る"
                      : "チャンネルの情報を直す"}
                  </DialogTitle>
                  <DialogClose disabled={form().phase === "saving"} />
                </div>
                <form
                  class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    dispatch({ type: "channel-form/submit" });
                  }}
                >
                  <TextField
                    label="名前（必須）"
                    value={form().draft.name}
                    onInput={(value) =>
                      dispatch({
                        type: "channel-form/input",
                        field: "name",
                        value,
                      })
                    }
                    placeholder="例：ねこの画像チャンネル"
                  />
                  <TextField
                    label="説明"
                    multiline
                    value={form().draft.about}
                    onInput={(value) =>
                      dispatch({
                        type: "channel-form/input",
                        field: "about",
                        value,
                      })
                    }
                    placeholder="どんな話をする場所か"
                  />
                  <ImageUrlField
                    label="画像"
                    aspectRatio={1}
                    preview={(url) => (
                      <ChannelPicture url={url} class="size-9 rounded-2" />
                    )}
                    value={form().draft.picture}
                    disabled={form().phase === "saving"}
                    onUploading={setUploading}
                    onChange={(value) =>
                      dispatch({
                        type: "channel-form/input",
                        field: "picture",
                        value,
                      })
                    }
                  />
                  <section class="flex flex-col gap-1.5">
                    <h3 class="c-secondary font-600 text-caption">
                      発言を読み書きするリレー
                    </h3>
                    <RelayColumnEditor
                      candidates={props.account}
                      selected={form().draft.relays}
                      minimum={1}
                      onChange={(relays) =>
                        dispatch({ type: "channel-form/relays", relays })
                      }
                    />
                    <p class="c-secondary text-caption">
                      チャンネルの情報と一緒に公開されます。ここに書いたリレーで、みんなが発言を読み書きします。
                    </p>
                  </section>
                  <Show when={form().mode === "create"}>
                    <Switch
                      label="作ったらお気に入りに入れる"
                      aside={<StorageHint scope="account" />}
                      checked={form().favorite}
                      onChange={(on) =>
                        dispatch({ type: "channel-form/favorite", on })
                      }
                    />
                  </Show>
                  <div
                    ref={actions}
                    class="flex scroll-m-4 flex-col items-stretch gap-2"
                    classList={{ "animate-shake": shaking() }}
                    onAnimationEnd={() => setShaking(false)}
                  >
                    <Show when={form().blocked}>
                      <p class="c-danger font-600 text-caption">
                        保存するか、やめてから閉じてください
                      </p>
                    </Show>
                    <div class="flex justify-end gap-2">
                      <Button
                        shape="rounded"
                        icon="i-material-symbols:close-rounded"
                        disabled={form().phase === "saving"}
                        onClick={() =>
                          dispatch({ type: "channel-form/discard" })
                        }
                      >
                        やめる
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        shape="rounded"
                        icon={
                          form().mode === "create"
                            ? "i-material-symbols:add-rounded"
                            : undefined
                        }
                        disabled={!canSubmitChannelForm(form()) || uploading()}
                      >
                        <Show
                          when={form().phase !== "saving"}
                          fallback="送信中…"
                        >
                          {form().mode === "create"
                            ? "チャンネルを作る"
                            : "保存"}
                        </Show>
                      </Button>
                    </div>
                    <Show
                      when={
                        form().mode === "edit" && !isChannelFormDirty(form())
                      }
                    >
                      <p class="c-secondary text-right text-caption">
                        変えたところがありません
                      </p>
                    </Show>
                  </div>
                </form>
              </>
            )}
          </Show>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default ChannelFormDialog;
