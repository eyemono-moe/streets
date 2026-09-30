import { Menu } from "@ark-ui/solid/menu";
import type { Deck } from "@streets/core/deck/deck";
import { type Component, For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import { textInputClass } from "../ui/TextField";

export type DeckSummary = Pick<Deck, "id" | "name"> & { columns: number };

const MENU_CONTENT =
  "motion-pop c-primary w-max min-w-40 max-w-80 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none";

const MENU_ITEM =
  "flex h-8.5 items-center gap-2.5 whitespace-nowrap rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary data-[disabled]:opacity-40";

/** 項目の値。デッキの id とほかの項目がぶつからないよう、デッキには接頭辞を付ける。 */
const deckValue = (id: string) => `deck:${id}`;

/** 名前を打ち直す欄。Enter か欄の外で確定し、Esc でやめる。 */
const RenameInput: Component<{
  name: string;
  onDone: (name: string | undefined) => void;
}> = (props) => {
  let done = false;
  const finish = (name: string | undefined) => {
    if (done) return;
    done = true;
    props.onDone(name);
  };
  return (
    <input
      ref={(el) => requestAnimationFrame(() => el.select())}
      aria-label="デッキの名前"
      class={`${textInputClass} min-w-0 flex-1`}
      value={props.name}
      onKeyDown={(event) => {
        if (event.isComposing) return;
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") {
          // パネルまで閉じないよう、ここで止める。
          event.stopPropagation();
          finish(undefined);
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
};

/** 開いているデッキを選び直すメニュー。最後の項目から新しいデッキを作る。 */
const DeckPicker: Component<{
  decks: readonly DeckSummary[];
  active: DeckSummary;
  defaultOpen?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      defaultOpen={props.defaultOpen}
      positioning={{ sameWidth: true }}
      onSelect={(details) => {
        if (details.value === "new") {
          dispatch({ type: "deck/open-panel", panel: "new-deck" });
          return;
        }
        const deck = props.decks.find(
          (deck) => deckValue(deck.id) === details.value,
        );
        if (deck) dispatch({ type: "deck/switch-deck", id: deck.id });
      }}
    >
      <Menu.Trigger
        aria-label={`デッキを切り替える（いまは「${props.active.name}」）`}
        class="flex h-13 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-2 bg-secondary pr-2 pl-3 text-left hover:bg-tertiary data-[state=open]:ring-2 data-[state=open]:ring-accent-5"
      >
        <span
          class="i-material-symbols:view-column-outline-rounded c-secondary size-5 shrink-0"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-700 text-body">{props.active.name}</span>
          <span class="c-secondary truncate text-caption">
            開いているデッキ・カラム {props.active.columns} 本
          </span>
        </span>
        <span
          class="i-material-symbols:expand-more-rounded c-secondary size-5 shrink-0"
          aria-hidden="true"
        />
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content class={MENU_CONTENT}>
            <For each={props.decks}>
              {(deck) => (
                <Menu.Item
                  value={deckValue(deck.id)}
                  class={MENU_ITEM}
                  aria-current={
                    deck.id === props.active.id ? "true" : undefined
                  }
                >
                  <span
                    class="i-material-symbols:check-rounded size-4.5 shrink-0"
                    classList={{
                      "c-accent-5": deck.id === props.active.id,
                      invisible: deck.id !== props.active.id,
                    }}
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1 truncate">{deck.name}</span>
                  <span class="c-secondary text-caption">
                    カラム {deck.columns} 本
                  </span>
                </Menu.Item>
              )}
            </For>
            <Menu.Separator class="my-1 border-primary border-t" />
            <Menu.Item value="new" class={MENU_ITEM}>
              <span
                class="i-material-symbols:add-rounded c-secondary size-4.5 shrink-0"
                aria-hidden="true"
              />
              新しいデッキ…
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

/**
 * 「デッキを編集する」パネルの上に置く、開いているデッキ。押すと別のデッキを選び直せ、
 * ⋮ から名前の変更・並べ替え・削除をする。
 */
const DeckEditHeader: Component<{
  decks: readonly DeckSummary[];
  activeId: string;
  /** Storybook で、名前を打ち直している姿・削除を確かめている姿・選ぶメニューを開いた姿を並べるため。 */
  initialRenaming?: boolean;
  initialConfirming?: boolean;
  initialPickerOpen?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [renaming, setRenaming] = createSignal(props.initialRenaming ?? false);
  const [confirming, setConfirming] = createSignal(
    props.initialConfirming ?? false,
  );
  const position = () =>
    props.decks.findIndex((deck) => deck.id === props.activeId);
  // `activeDeck` が見つからないときに先頭を返すのと揃える。
  const active = () => props.decks[Math.max(position(), 0)]!;
  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-1.5">
        <Show
          when={!renaming()}
          fallback={
            <RenameInput
              name={active().name}
              onDone={(name) => {
                setRenaming(false);
                if (name !== undefined) {
                  dispatch({
                    type: "deck/rename-deck",
                    id: active().id,
                    name,
                  });
                }
              }}
            />
          }
        >
          <DeckPicker
            decks={props.decks}
            active={active()}
            defaultOpen={props.initialPickerOpen}
          />
        </Show>
        <Menu.Root
          lazyMount
          unmountOnExit
          onSelect={(details) => {
            if (details.value === "rename") setRenaming(true);
            if (details.value === "up" || details.value === "down") {
              dispatch({
                type: "deck/move-deck",
                id: active().id,
                to: position() + (details.value === "up" ? -1 : 1),
              });
            }
            if (details.value === "remove") setConfirming(true);
          }}
        >
          <Menu.Trigger
            asChild={(trigger) => (
              <IconButton
                {...trigger()}
                size="md"
                icon="i-material-symbols:more-vert"
                label={`「${active().name}」の操作`}
              />
            )}
          />
          <Portal>
            <Menu.Positioner>
              <Menu.Content class={MENU_CONTENT}>
                <Menu.Item value="rename" class={MENU_ITEM}>
                  <span
                    class="i-material-symbols:edit-outline-rounded c-secondary size-4.5"
                    aria-hidden="true"
                  />
                  名前を変える
                </Menu.Item>
                <Menu.Item
                  value="up"
                  class={MENU_ITEM}
                  disabled={position() <= 0}
                >
                  <span
                    class="i-material-symbols:arrow-upward-rounded c-secondary size-4.5"
                    aria-hidden="true"
                  />
                  一覧で上へ動かす
                </Menu.Item>
                <Menu.Item
                  value="down"
                  class={MENU_ITEM}
                  disabled={position() >= props.decks.length - 1}
                >
                  <span
                    class="i-material-symbols:arrow-downward-rounded c-secondary size-4.5"
                    aria-hidden="true"
                  />
                  一覧で下へ動かす
                </Menu.Item>
                <Menu.Separator class="my-1 border-primary border-t" />
                <Menu.Item
                  value="remove"
                  class={`${MENU_ITEM} c-danger`}
                  // 最後の 1 つは消せない（開くデッキが無くなる）。
                  disabled={props.decks.length <= 1}
                >
                  <span
                    class="i-material-symbols:delete-outline-rounded size-4.5"
                    aria-hidden="true"
                  />
                  このデッキを削除
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </div>
      <Show when={confirming()}>
        <div class="motion-fade flex animate-in flex-col gap-2 rounded-2 border border-primary p-3">
          <p class="text-caption">
            「{active().name}
            」と、その中のカラムの並びを削除します。元には戻せません。
          </p>
          <div class="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              やめる
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="i-material-symbols:delete-outline-rounded"
              onClick={() => {
                setConfirming(false);
                dispatch({ type: "deck/remove-deck", id: active().id });
              }}
            >
              削除する
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default DeckEditHeader;
