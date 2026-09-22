import {
  DEFAULT_KEYMAP,
  type Keymap,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  type ShortcutAction,
  conflictingAction,
} from "@streets/core/settings/keymap";
import { createHotkeyRecorder } from "@tanstack/solid-hotkeys";
import {
  type Component,
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
} from "solid-js";
import { displayHotkey } from "../keymap";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import Switch from "../ui/Switch";
import SettingsSection from "./SettingsSection";

/**
 * ショートカットキーの設定。今の割り当てを受け取って描き、変えたらイベントを
 * 上へ渡す。キーは実際に押して決める —— 打ち込む形だと、`[KeyN]` のような
 * 書き方を覚えないと変えられないため。
 */
const KeyboardSettings: Component<{
  keymap: Keymap;
  /** 数字キーでカラムを見せるか（この端末の設定）。 */
  columnDigits: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [editing, setEditing] = createSignal<ShortcutAction>();
  const [error, setError] = createSignal<string>();

  const set = (action: ShortcutAction, hotkey: string) =>
    dispatch({ type: "deck/set-shortcut", action, hotkey });

  const recorder = createHotkeyRecorder({
    onRecord: (hotkey) => {
      const action = editing();
      if (!action) return;
      set(action, hotkey);
      setEditing(undefined);
    },
    // 変更中に Backspace を押すと、そのショートカットを使わないことにする。
    onClear: () => {
      const action = editing();
      if (action) set(action, "");
      setEditing(undefined);
    },
    onCancel: () => setEditing(undefined),
    validate: (hotkey, { parsedHotkey }) => {
      const action = editing();
      if (!action) return true;
      const other = conflictingAction(props.keymap, action, hotkey);
      if (other) return `${SHORTCUT_LABELS[other]} で使っています`;
      // 1〜9 は左から数えたカラムを見せるのに使っていて、変えられない。
      if (
        parsedHotkey.modifiers.length === 0 &&
        /^\[Digit[1-9]\]$/.test(hotkey)
      ) {
        return "1〜9 はカラムを見せるのに使っています";
      }
      return true;
    },
    onReject: ({ message }) => setError(message),
  });

  const start = (action: ShortcutAction) => {
    setError(undefined);
    setEditing(action);
    recorder.startRecording();
  };

  // キーを待っている間の Esc は、変更の取り消しだけに使う。設定のダイアログも
  // Esc で閉じるので、いちばん外側（window の捕捉）で受け取って先に止める。
  createEffect(() => {
    if (!recorder.isRecording()) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      recorder.cancelRecording();
      setEditing(undefined);
    };
    window.addEventListener("keydown", onKeyDown, true);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, true));
  });

  return (
    <div class="flex flex-col gap-7">
      <SettingsSection
        title="ショートカットキー"
        scope="device"
        description="使用するキーを変更できます。「変更」を押してから、割り当てたいキーを押してください。変更を取り消すときは Esc、そのショートカットを使用しないようにするときは Backspace を押してください。"
      >
        <ul class="flex flex-col gap-px overflow-hidden rounded-2 border border-primary bg-tertiary">
          <For each={SHORTCUT_ACTIONS}>
            {(action) => (
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-primary px-3 py-2.5">
                <span class="c-primary min-w-32 flex-1 text-body">
                  {SHORTCUT_LABELS[action]}
                </span>
                <Show
                  when={editing() === action && recorder.isRecording()}
                  fallback={<Key hotkey={props.keymap[action]} />}
                >
                  <span class="c-accent-5 font-600 text-caption">
                    キーを押してください…
                  </span>
                </Show>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    editing() === action
                      ? recorder.cancelRecording()
                      : start(action)
                  }
                >
                  {editing() === action ? "やめる" : "変更"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="i-material-symbols:refresh-rounded"
                  aria-label={`${SHORTCUT_LABELS[action]} を既定のキーに戻す`}
                  title="既定に戻す"
                  disabled={props.keymap[action] === DEFAULT_KEYMAP[action]}
                  onClick={() => set(action, DEFAULT_KEYMAP[action])}
                />
              </li>
            )}
          </For>
        </ul>
        <Show when={error()}>
          {(message) => <p class="c-danger text-caption">{message()}</p>}
        </Show>
      </SettingsSection>

      <SettingsSection
        title="数字キーでのカラム移動"
        scope="device"
        description="オンにすると、1〜9 の数字キーを押したときに、その番号のカラムに移動します。オフにすると、数字キーは効かなくなります。"
      >
        <Switch
          label="数字キーでカラムへ移動する"
          checked={props.columnDigits}
          onChange={(on) => dispatch({ type: "deck/set-column-digits", on })}
        />
      </SettingsSection>
    </div>
  );
};

/** 今のキー。使わないことにしているときは、そう書く。 */
const Key: Component<{ hotkey: string }> = (props) => (
  <Show
    when={props.hotkey !== ""}
    fallback={<span class="c-secondary text-caption">使わない</span>}
  >
    <kbd class="c-primary rounded-1.5 border border-primary bg-secondary px-2 py-0.5 font-600 text-caption">
      {displayHotkey(props.hotkey)}
    </kbd>
  </Show>
);

export default KeyboardSettings;
