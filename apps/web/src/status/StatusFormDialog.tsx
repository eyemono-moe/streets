import { formatEventTime } from "@streets/core/view/format-time";
import {
  type StatusExpiry,
  type StatusFormState,
  canSubmitStatusForm,
} from "@streets/core/view/status-form";
import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
  on,
} from "solid-js";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SegmentedControl from "../ui/SegmentedControl";
import TextField from "../ui/TextField";

/** よく使う状態。押すと本文に入る。 */
const PRESETS = ["💻 作業中", "☕ 休憩中", "🚶 外出中", "💤 寝ています"];

const EXPIRIES: { value: Exclude<StatusExpiry, "keep">; label: string }[] = [
  { value: "never", label: "消さない" },
  { value: "1h", label: "1 時間" },
  { value: "today", label: "今日中" },
  { value: "1w", label: "1 週間" },
];

/**
 * 自分のステータスを設定するダイアログ。状態は裁定する段（StatusFormMediator）が持つ。
 * 書きかけのまま閉じようとしたら閉じず、ボタンの欄を揺らして知らせる。
 */
const StatusFormDialog: Component<{ form: StatusFormState }> = (props) => {
  const dispatch = useDispatch();
  const editing = () =>
    props.form.phase === "closed" ? undefined : props.form;
  const [shaking, setShaking] = createSignal(false);
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
      onClose={() => dispatch({ type: "status-form/close" })}
    >
      <DialogPortal>
        <DialogContent class="w-full max-w-120 rounded-3 border border-primary">
          <Show when={editing()}>
            {(form) => (
              <>
                <div class="flex h-12 shrink-0 items-center gap-2 pr-3 pl-4">
                  <DialogTitle class="flex-1 font-600 text-body">
                    ステータスを設定
                  </DialogTitle>
                  <DialogClose disabled={form().phase === "saving"} />
                </div>
                <form
                  class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    dispatch({ type: "status-form/submit" });
                  }}
                >
                  <div class="flex flex-col gap-2">
                    <TextField
                      label="いまの状態"
                      value={form().draft.content}
                      onInput={(value) =>
                        dispatch({
                          type: "status-form/input",
                          field: "content",
                          value,
                        })
                      }
                      placeholder="例：作業中"
                    />
                    <div class="flex flex-wrap gap-1.5">
                      <For each={PRESETS}>
                        {(preset) => (
                          <Button
                            size="sm"
                            disabled={form().phase === "saving"}
                            onClick={() =>
                              dispatch({
                                type: "status-form/input",
                                field: "content",
                                value: preset,
                              })
                            }
                          >
                            {preset}
                          </Button>
                        )}
                      </For>
                    </div>
                  </div>
                  <TextField
                    label="リンク（任意）"
                    type="url"
                    value={form().draft.link}
                    onInput={(value) =>
                      dispatch({
                        type: "status-form/input",
                        field: "link",
                        value,
                      })
                    }
                    placeholder="https://"
                  />
                  <section class="flex flex-col gap-1.5">
                    <h3 class="c-secondary font-600 text-caption">
                      消える時刻
                    </h3>
                    <SegmentedControl
                      label="消える時刻"
                      variant="secondary"
                      // 直す前の期限（keep）は選ぶ欄に入れず、下に書く。どれも選んでいない
                      // 形で始め、選んだら置き換わる（入れると、狭い画面で横にはみ出す）。
                      options={EXPIRIES}
                      value={form().draft.expiry}
                      onChange={(expiry) =>
                        dispatch({ type: "status-form/expiry", expiry })
                      }
                    />
                    <Show
                      when={
                        form().draft.expiry === "keep" && form().keptExpiresAt
                      }
                    >
                      {(at) => (
                        <p class="c-secondary text-caption">
                          今の期限のまま（
                          {formatEventTime(
                            new Date(at() * 1000),
                            new Date(),
                          )}{" "}
                          に消えます）。変えるときは上から選んでください。
                        </p>
                      )}
                    </Show>
                  </section>
                  <p class="c-secondary text-caption">
                    名前の横やプロフィールに出ます。聴いている曲は、再生するアプリが自動で設定するので、ここでは扱いません。
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
                    <div class="flex flex-wrap items-center gap-2">
                      <Show when={form().hasCurrent}>
                        <Button
                          shape="rounded"
                          variant="danger"
                          icon="i-material-symbols:delete-outline-rounded"
                          disabled={form().phase === "saving"}
                          onClick={() =>
                            dispatch({ type: "status-form/clear" })
                          }
                        >
                          ステータスを消す
                        </Button>
                      </Show>
                      <span class="flex-1" />
                      <Button
                        shape="rounded"
                        icon="i-material-symbols:close-rounded"
                        disabled={form().phase === "saving"}
                        onClick={() =>
                          dispatch({ type: "status-form/discard" })
                        }
                      >
                        やめる
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        shape="rounded"
                        disabled={!canSubmitStatusForm(form())}
                      >
                        <Show
                          when={form().phase !== "saving"}
                          fallback="送信中…"
                        >
                          保存
                        </Show>
                      </Button>
                    </div>
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

export default StatusFormDialog;
