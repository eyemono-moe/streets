import { buildUserColumn } from "@streets/core/deck/column-presets";
import { decodeUserInput, encodeBech32 } from "@streets/core/nostr/nip19";
import { type Profile, profileLabel } from "@streets/core/nostr/profile";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import { searchEntries } from "@streets/core/signal/search";
import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from "solid-js";
import { useUserCandidates, useUserSearch } from "../completion/sources";
import { useOptionalReadLayer } from "../read-layer";
import {
  availableSettings,
  type RegisteredSetting,
} from "../settings/setting-registry";
import { type UiEvent, useDispatch } from "../ui-events";
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
type UserCommand = { kind: "user"; id: string; title: string; pubkey: string };
type Command = PaletteAction | SettingCommand | UserCommand;

/** 操作と設定を同じ検索結果に並べる、全体の入口。 */
const CommandPalette: Component<{
  open: boolean;
  signedIn: boolean;
  /** ストーリーなどで最初の結果を見せるための語。 */
  initialQuery?: string;
  searchRelays?: () => readonly RelayUrl[];
}> = (props) => {
  const dispatch = useDispatch();
  let input: HTMLInputElement | undefined;
  const [query, setQuery] = createSignal(props.initialQuery ?? "");
  const [selected, setSelected] = createSignal(0);
  let pending: UiEvent | undefined;
  const atQuery = createMemo(() => /^[@＠]([^\s]*)$/.exec(query().trim())?.[1]);
  const userSearch = useUserSearch(
    () => (props.open ? (atQuery() ?? "") : ""),
    () => props.searchRelays?.() ?? [],
  );
  const people = useUserCandidates(undefined, userSearch.found);
  const userPubkey = createMemo(() =>
    decodeUserInput(
      query()
        .trim()
        .replace(/^[@＠]/, ""),
    ),
  );
  const [profile, setProfile] = createSignal<Profile>();
  const readLayer = useOptionalReadLayer();
  createEffect(() => {
    const pubkey = userPubkey();
    setProfile(undefined);
    if (pubkey && readLayer) {
      onCleanup(
        readLayer.lookups.watchProfile(pubkey, (details) =>
          setProfile(details?.profile),
        ),
      );
    }
  });
  const userName = () => {
    const pubkey = userPubkey();
    return pubkey ? profileLabel(profile(), pubkey) : "";
  };
  const actions = createMemo(() => availableActions(props.signedIn));
  const candidates = createMemo<Command[]>(() => [
    ...actions(),
    ...availableSettings(props.signedIn).map((setting): SettingCommand => ({
      ...setting,
      kind: "setting",
    })),
  ]);
  const results = createMemo<Command[]>(() => {
    const pubkey = userPubkey();
    if (pubkey) {
      return [
        {
          kind: "action",
          id: `user-column:${pubkey}`,
          title: `${userName()}のカラムを追加する`,
          section: "操作",
          keywords: [],
          event: { type: "deck/add-column", column: buildUserColumn(pubkey) },
        },
        {
          kind: "action",
          id: `user-search:${pubkey}`,
          title: `${userName()}の投稿を検索する`,
          section: "操作",
          keywords: [],
          event: {
            type: "deck/open-search",
            query: `from:${encodeBech32("npub", pubkey)}`,
          },
        },
      ];
    }
    const at = atQuery();
    if (at !== undefined) {
      return people
        .find(at)
        .filter(({ pubkey }) => /^[0-9a-f]{64}$/i.test(pubkey))
        .slice(0, 10)
        .map(({ pubkey, user }): UserCommand => ({
          kind: "user",
          id: `user:${pubkey}`,
          pubkey,
          title: profileLabel(user.profile, pubkey),
        }));
    }
    return query().trim()
      ? searchEntries(candidates(), query()).map(({ entry }) => entry)
      : actions();
  });
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
    if (command.kind === "user") {
      setQuery(encodeBech32("npub", command.pubkey));
      input?.focus({ preventScroll: true });
      return;
    }
    pending =
      command.kind === "setting"
        ? { type: "deck/open-settings", setting: command.id }
        : command.event;
    dispatch({ type: "deck/close-palette" });
  };
  const search = () => {
    pending = { type: "deck/open-search", query: query().trim() };
    dispatch({ type: "deck/close-palette" });
  };
  const afterClose = () => {
    const event = pending;
    pending = undefined;
    if (event) dispatch(event);
  };

  return (
    <DialogRoot
      open={props.open}
      onClose={() => dispatch({ type: "deck/close-palette" })}
      onExitComplete={afterClose}
    >
      <DialogPortal>
        <DialogContent class="h-[min(560px,calc(100dvh-32px))] w-[min(640px,calc(100vw-32px))] rounded-3 border border-primary shadow-xl">
          <DialogTitle class="sr-only">コマンドパレット</DialogTitle>
          <DialogDescription class="sr-only">
            操作や設定を検索して選べます。
          </DialogDescription>
          <div class="flex shrink-0 items-center gap-2 border-primary border-b p-3">
            <SearchInput
              ref={(element) => (input = element)}
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
              aria-activedescendant={`signal-command-${selected()}`}
              onKeyDown={(event) => {
                if (event.isComposing || event.keyCode === 229) {
                  if (event.key === "Escape") event.stopPropagation();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSelected((current) =>
                    Math.min(current + 1, results().length),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelected((current) => Math.max(0, current - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const command = results()[selected()];
                  if (command) choose(command);
                  else search();
                }
              }}
            />
            <DialogClose label="コマンドパレットを閉じる" />
          </div>
          <div
            id="signal-command-results"
            role="listbox"
            aria-label="検索結果"
            class="flex min-h-0 flex-1 flex-col"
          >
            <DialogBody class="min-h-0 flex-1 p-2">
              <div>
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
                        category={
                          command.kind === "action"
                            ? "操作"
                            : command.kind === "user"
                              ? `${encodeBech32("npub", command.pubkey).slice(0, 12)}…`
                              : "設定"
                        }
                        icon={
                          command.kind === "action"
                            ? "i-material-symbols:bolt-rounded"
                            : command.kind === "user"
                              ? "i-material-symbols:person-outline-rounded"
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
            <div class="shrink-0 border-primary border-t p-2">
              <CommandOption
                id={`signal-command-${results().length}`}
                title={
                  query().trim()
                    ? `「${query().trim()}」で検索する`
                    : "検索パネルを開く"
                }
                category="検索"
                icon="i-material-symbols:search-rounded"
                selected={selected() === results().length}
                onSelect={search}
                onHover={() => setSelected(results().length)}
              />
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  );
};

export default CommandPalette;
