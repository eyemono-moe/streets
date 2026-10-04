import { searchEntries } from "@streets/core/signal/search";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";
import {
  availableSettings,
  type RegisteredSetting,
} from "../settings/setting-registry";
import { useDispatch } from "../ui-events";
import CommandOption from "../ui/CommandOption";
import {
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "../ui/Dialog";
import SearchInput from "../ui/SearchInput";
import { availableActions, type PaletteAction } from "./action-registry";

type SettingCommand = RegisteredSetting & { kind: "setting" };
type Command = PaletteAction | SettingCommand;

/** 操作と設定を同じ検索結果に並べる、全体の入口。 */
const CommandPalette: Component<{
  open: boolean;
  signedIn: boolean;
  /** ストーリーなどで最初の結果を見せるための語。 */
  initialQuery?: string;
}> = (props) => {
  const dispatch = useDispatch();
  const [query, setQuery] = createSignal(props.initialQuery ?? "");
  const [selected, setSelected] = createSignal(0);
  let pending: Command | undefined;
  const actions = createMemo(() => availableActions(props.signedIn));
  const candidates = createMemo<Command[]>(() => [
    ...actions(),
    ...availableSettings(props.signedIn).map((setting): SettingCommand => ({
      ...setting,
      kind: "setting",
    })),
  ]);
  const results = createMemo<Command[]>(() =>
    query().trim()
      ? searchEntries(candidates(), query()).map(({ entry }) => entry)
      : actions(),
  );
  createEffect(on(query, () => setSelected(0)));
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open) {
          pending = undefined;
          setQuery(props.initialQuery ?? "");
          setSelected(0);
        }
      },
      { defer: true },
    ),
  );

  const choose = (command: Command) => {
    pending = command;
    dispatch({ type: "deck/close-palette" });
  };
  const afterClose = () => {
    const command = pending;
    pending = undefined;
    if (!command) return;
    if (command.kind === "setting") {
      dispatch({ type: "deck/open-settings", setting: command.id });
    } else {
      dispatch(command.event);
    }
  };

  return (
    <DialogRoot
      open={props.open}
      onClose={() => dispatch({ type: "deck/close-palette" })}
      onExitComplete={afterClose}
    >
      <DialogPortal>
        <DialogContent class="w-[min(640px,calc(100vw-32px))] rounded-3 border border-primary shadow-xl">
          <DialogTitle class="sr-only">コマンドパレット</DialogTitle>
          <DialogDescription class="sr-only">
            操作や設定を検索して選べます。
          </DialogDescription>
          <div class="flex shrink-0 items-center gap-2 border-primary border-b p-3">
            <SearchInput
              autofocus
              class="min-w-0 flex-1"
              label="操作や設定を検索"
              placeholder="操作や設定を検索"
              value={query()}
              onValueChange={setQuery}
              clearable
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={props.open}
              aria-controls="signal-command-results"
              aria-activedescendant={
                results().length > 0
                  ? `signal-command-${selected()}`
                  : undefined
              }
              onKeyDown={(event) => {
                if (event.isComposing || event.keyCode === 229) {
                  if (event.key === "Escape") event.stopPropagation();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelected((current) =>
                    Math.max(0, Math.min(current + 1, results().length - 1)),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelected((current) => Math.max(0, current - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const command = results()[selected()];
                  if (command) choose(command);
                }
              }}
            />
            <DialogClose label="コマンドパレットを閉じる" />
          </div>
          <DialogBody class="max-h-[min(520px,calc(100dvh-120px))] p-2">
            <div
              id="signal-command-results"
              role="listbox"
              aria-label="検索結果"
            >
              <Show
                when={results().length > 0}
                fallback={
                  <p class="c-secondary px-3 py-6 text-center text-body">
                    該当する操作や設定はありません。
                  </p>
                }
              >
                <For each={results()}>
                  {(command, index) => (
                    <CommandOption
                      id={`signal-command-${index()}`}
                      title={command.title}
                      category={command.kind === "action" ? "操作" : "設定"}
                      icon={
                        command.kind === "action"
                          ? "i-material-symbols:bolt-rounded"
                          : "i-material-symbols:settings-outline-rounded"
                      }
                      selected={selected() === index()}
                      onSelect={() => choose(command)}
                      onHover={() => setSelected(index())}
                    />
                  )}
                </For>
              </Show>
            </div>
          </DialogBody>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default CommandPalette;
