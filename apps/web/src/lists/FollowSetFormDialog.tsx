import {
  type FollowSetFormState,
  canSubmitFollowSetForm,
  isFollowSetFormDirty,
} from "@streets/core/lists/follow-set-form";
import { type Component, Show, createEffect, createSignal, on } from "solid-js";
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
import TextField from "../ui/TextField";
import FollowSetPicture from "./FollowSetPicture";

/**
 * リストを作る・直すダイアログ。状態は裁定する段（FollowSetMediator）が持つ。
 * 書きかけのまま閉じようとしたら閉じず、ボタンの欄を揺らして知らせる。
 */
const FollowSetFormDialog: Component<{ form: FollowSetFormState }> = (
  props,
) => {
  const dispatch = useDispatch();
  const editing = () =>
    props.form.phase === "closed" ? undefined : props.form;
  const [shaking, setShaking] = createSignal(false);
  // 画像を上げている間は送らせない。上げ終わる前に送ると、画像の無いリストになる。
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
  const input = (field: "title" | "description" | "image", value: string) =>
    dispatch({ type: "follow-set-form/input", field, value });

  return (
    <DialogRoot
      open={props.form.phase !== "closed"}
      onClose={() => dispatch({ type: "follow-set-form/close" })}
    >
      <DialogPortal>
        <DialogContent class="w-full max-w-120 rounded-3 border border-primary">
          <Show when={editing()}>
            {(form) => (
              <>
                <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
                  <DialogTitle class="flex-1 font-600 text-body">
                    {form().mode === "create"
                      ? "リストを作る"
                      : "リストの情報を直す"}
                  </DialogTitle>
                  <DialogClose disabled={form().phase === "saving"} />
                </div>
                <form
                  class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    dispatch({ type: "follow-set-form/submit" });
                  }}
                >
                  <TextField
                    label="名前（必須）"
                    value={form().draft.title}
                    onInput={(value) => input("title", value)}
                    placeholder="例：よく話す人"
                  />
                  <TextField
                    label="説明"
                    multiline
                    value={form().draft.description}
                    onInput={(value) => input("description", value)}
                    placeholder="どんな人を集めたリストか"
                  />
                  <ImageUrlField
                    label="画像"
                    aspectRatio={1}
                    preview={(url) => (
                      <FollowSetPicture url={url} class="size-9 rounded-2" />
                    )}
                    value={form().draft.image}
                    disabled={form().phase === "saving"}
                    onUploading={setUploading}
                    onChange={(value) => input("image", value)}
                  />
                  <p class="c-secondary text-caption">
                    リストの名前・説明・画像は、ほかの人も見られます。入れる人ごとに、公開か非公開かを選べます。
                  </p>
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
                          dispatch({ type: "follow-set-form/discard" })
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
                        disabled={
                          !canSubmitFollowSetForm(form()) || uploading()
                        }
                      >
                        <Show
                          when={form().phase !== "saving"}
                          fallback="送信中…"
                        >
                          {form().mode === "create" ? "リストを作る" : "保存"}
                        </Show>
                      </Button>
                    </div>
                    <Show
                      when={
                        form().mode === "edit" && !isFollowSetFormDirty(form())
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

export default FollowSetFormDialog;
