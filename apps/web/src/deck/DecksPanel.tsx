import { Menu } from "@ark-ui/solid/menu";
import type { Deck } from "@streets/core/deck/deck";
import { type Component, For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useDispatch } from "../ui-events";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import SegmentedControl from "../ui/SegmentedControl";
import StorageHint from "../ui/StorageHint";
import TextField, { textInputClass } from "../ui/TextField";

type DeckSummary = Pick<Deck, "id" | "name"> & { columns: number };

/** 新しいデッキの最初のカラム。 */
export type NewDeckSource = "copy" | "default";

const MENU_ITEM =
  "flex h-8.5 items-center gap-2.5 whitespace-nowrap rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary data-[disabled]:opacity-40";

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

const Row: Component<{
  deck: DeckSummary;
  active: boolean;
  position: number;
  count: number;
  initialRenaming?: boolean;
  initialConfirming?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const [renaming, setRenaming] = createSignal(props.initialRenaming ?? false);
  const [confirming, setConfirming] = createSignal(
    props.initialConfirming ?? false,
  );
  return (
    <li class="flex flex-col gap-2 rounded-2 border border-primary bg-primary p-1.5">
      <div class="flex items-center gap-1.5">
        <Show
          when={!renaming()}
          fallback={
            <RenameInput
              name={props.deck.name}
              onDone={(name) => {
                setRenaming(false);
                if (name !== undefined) {
                  dispatch({
                    type: "deck/rename-deck",
                    id: props.deck.id,
                    name,
                  });
                }
              }}
            />
          }
        >
          <button
            type="button"
            aria-current={props.active ? "true" : undefined}
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-1.5 bg-transparent px-1.5 py-1 text-left hover:bg-secondary"
            onClick={() =>
              dispatch({ type: "deck/switch-deck", id: props.deck.id })
            }
          >
            <span
              class="i-material-symbols:check-rounded size-4.5 shrink-0"
              classList={{
                "c-accent-5": props.active,
                invisible: !props.active,
              }}
              aria-hidden="true"
            />
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate font-600 text-body">{props.deck.name}</span>
              <span class="c-secondary text-caption">
                {props.active
                  ? `開いています・カラム ${props.deck.columns} 本`
                  : `カラム ${props.deck.columns} 本`}
              </span>
            </span>
          </button>
        </Show>
        <IconButton
          icon="i-material-symbols:edit-outline-rounded"
          label={`「${props.deck.name}」の名前を変える`}
          onClick={() => setRenaming(true)}
        />
        <Menu.Root
          lazyMount
          unmountOnExit
          onSelect={(details) => {
            if (details.value === "up" || details.value === "down") {
              dispatch({
                type: "deck/move-deck",
                id: props.deck.id,
                to: props.position + (details.value === "up" ? -1 : 1),
              });
            }
            if (details.value === "remove") setConfirming(true);
          }}
        >
          <Menu.Trigger
            asChild={(trigger) => (
              <IconButton
                {...trigger()}
                icon="i-material-symbols:more-vert"
                label={`「${props.deck.name}」の操作`}
              />
            )}
          />
          <Portal>
            <Menu.Positioner>
              <Menu.Content class="motion-pop c-primary w-max min-w-40 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
                <Menu.Item
                  value="up"
                  class={MENU_ITEM}
                  disabled={props.position === 0}
                >
                  <span
                    class="i-material-symbols:arrow-upward-rounded c-secondary size-4.5"
                    aria-hidden="true"
                  />
                  上へ動かす
                </Menu.Item>
                <Menu.Item
                  value="down"
                  class={MENU_ITEM}
                  disabled={props.position === props.count - 1}
                >
                  <span
                    class="i-material-symbols:arrow-downward-rounded c-secondary size-4.5"
                    aria-hidden="true"
                  />
                  下へ動かす
                </Menu.Item>
                <Menu.Separator class="my-1 border-primary border-t" />
                <Menu.Item
                  value="remove"
                  class={`${MENU_ITEM} c-danger`}
                  // 最後の 1 つは消せない（開くデッキが無くなる）。
                  disabled={props.count <= 1}
                >
                  <span
                    class="i-material-symbols:delete-outline-rounded size-4.5"
                    aria-hidden="true"
                  />
                  削除
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </div>
      <Show when={confirming()}>
        <div class="motion-fade flex animate-in flex-col gap-2 rounded-1.5 bg-secondary p-2.5">
          <p class="text-caption">
            「{props.deck.name}
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
              onClick={() =>
                dispatch({ type: "deck/remove-deck", id: props.deck.id })
              }
            >
              削除する
            </Button>
          </div>
        </div>
      </Show>
    </li>
  );
};

/** 新しいデッキを足す欄。名前が空なら、候補の名前（`placeholder`）で足す。 */
const AddDeckForm: Component<{ placeholder: string }> = (props) => {
  const dispatch = useDispatch();
  const [name, setName] = createSignal("");
  const [from, setFrom] = createSignal<NewDeckSource>("copy");
  return (
    <form
      class="flex flex-col gap-3 border-primary border-t pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({
          type: "deck/add-deck",
          name: name().trim() || props.placeholder,
          from: from(),
        });
        setName("");
      }}
    >
      <h3 class="flex items-center gap-1.5 font-600 text-body">
        デッキを追加
        <StorageHint scope="account" />
      </h3>
      <TextField
        label="名前"
        value={name()}
        placeholder={props.placeholder}
        onInput={setName}
      />
      <div class="flex flex-col gap-1">
        <span class="c-secondary font-600 text-caption">最初のカラム</span>
        <SegmentedControl
          label="最初のカラム"
          block
          options={[
            { value: "copy", label: "いまのデッキを複製" },
            { value: "default", label: "はじめの構成" },
          ]}
          value={from()}
          onChange={setFrom}
        />
      </div>
      <Button
        type="submit"
        variant="primary"
        icon="i-material-symbols:add-rounded"
      >
        追加して開く
      </Button>
    </form>
  );
};

/**
 * デッキの一覧。押すとそのデッキを開き、名前の変更・並べ替え・削除もここで行う。
 * 下の欄から新しいデッキを足す。
 */
const DecksPanel: Component<{
  decks: readonly DeckSummary[];
  activeId: string;
  /** 新しいデッキの名前の候補。 */
  nextName: string;
  /** Storybook で、名前を打ち直している姿・削除を確かめている姿を並べるため。 */
  initialRenaming?: string;
  initialConfirming?: string;
}> = (props) => (
  <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4">
    <p class="c-secondary text-caption">
      用途ごとにカラムの並びを分けて持てます（スマホ用・PC
      用など）。どのデッキを開いているかは、この端末に覚えます。
    </p>
    <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
      <For each={props.decks}>
        {(deck, index) => (
          <Row
            deck={deck}
            active={deck.id === props.activeId}
            position={index()}
            count={props.decks.length}
            initialRenaming={props.initialRenaming === deck.id}
            initialConfirming={props.initialConfirming === deck.id}
          />
        )}
      </For>
    </ol>
    <AddDeckForm placeholder={props.nextName} />
  </div>
);

export default DecksPanel;
