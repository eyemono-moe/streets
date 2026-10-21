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
import { plural, t } from "../i18n/locale";
import { useOptionalReadLayer } from "../read-layer";
import {
  availableSettings,
  type SettingEntry,
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

type SettingCommand = SettingEntry & { kind: "setting" };
type UserCommand = { kind: "user"; id: string; title: string; pubkey: string };
type Command = PaletteAction | SettingCommand | UserCommand;

/** 操作と設定を同じ検索結果に並べる、全体の入口。 */
const CommandPalette: Component<{
  open: boolean;
  signedIn: boolean;
  /** ストーリーなどで最初の結果を見せるための語。 */
  initialQuery?: string;
  searchRelays?: () => readonly RelayUrl[];
  decks?: readonly { id: string; name: string; columns: number }[];
}> = (props) => {
  const dispatch = useDispatch();
  let input: HTMLInputElement | undefined;
  let resultsBody: HTMLDivElement | undefined;
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
  const decks = createMemo<PaletteAction[]>(() =>
    (props.decks ?? []).map((deck) => ({
      kind: "action",
      id: `deck:${deck.id}`,
      title: t("signal.deck.switchTo", { name: deck.name }),
      section: t("signal.sections.deck"),
      keywords: [deck.name, t("signal.deck.switchKeyword")],
      description: plural("signal.deck.columnCount", deck.columns),
      event: { type: "deck/switch-deck", id: deck.id },
    })),
  );
  const candidates = createMemo<Command[]>(() => [
    ...actions(),
    ...decks(),
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
          title: t("signal.user.addColumn", { name: userName() }),
          section: t("signal.sections.action"),
          keywords: [],
          event: { type: "deck/add-column", column: buildUserColumn(pubkey) },
        },
        {
          kind: "action",
          id: `user-search:${pubkey}`,
          title: t("signal.user.searchPosts", { name: userName() }),
          section: t("signal.sections.action"),
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
  createEffect(() => {
    const index = selected();
    if (index >= results().length) return;
    const option = resultsBody?.querySelector<HTMLElement>(
      `#signal-command-${index}`,
    );
    if (!option || !resultsBody) return;
    const body = resultsBody.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < body.top) resultsBody.scrollTop += row.top - body.top;
    else if (row.bottom > body.bottom)
      resultsBody.scrollTop += row.bottom - body.bottom;
  });
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
        : typeof command.event === "function"
          ? command.event()
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
          <DialogTitle class="sr-only">{t("signal.palette.title")}</DialogTitle>
          <DialogDescription class="sr-only">
            {t("signal.palette.description")}
          </DialogDescription>
          <div class="flex shrink-0 items-center gap-2 border-primary border-b p-3">
            <SearchInput
              ref={(element) => (input = element)}
              autofocus
              class="min-w-0 flex-1"
              label={t("signal.palette.searchLabel")}
              placeholder={t("signal.palette.searchLabel")}
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
            <DialogClose label={t("signal.palette.close")} />
          </div>
          <div
            id="signal-command-results"
            role="listbox"
            aria-label={t("signal.palette.resultsLabel")}
            class="flex min-h-0 flex-1 flex-col"
          >
            <DialogBody
              ref={(element) => (resultsBody = element)}
              class="min-h-0 flex-1 p-2"
            >
              <div>
                <Show
                  when={results().length > 0}
                  fallback={
                    <p class="c-secondary px-3 py-6 text-center text-body">
                      {t("signal.palette.empty")}
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
                            ? (command.section ?? t("signal.sections.action"))
                            : command.kind === "user"
                              ? `${encodeBech32("npub", command.pubkey).slice(0, 12)}…`
                              : t("signal.sections.setting")
                        }
                        icon={
                          command.kind === "action"
                            ? "i-material-symbols:terminal-rounded"
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
                    ? t("signal.palette.searchFor", { query: query().trim() })
                    : t("signal.palette.openSearch")
                }
                category={t("signal.sections.search")}
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
