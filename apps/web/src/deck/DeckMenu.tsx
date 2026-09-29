import { Menu } from "@ark-ui/solid/menu";
import type { Deck } from "@streets/core/deck/deck";
import { type Component, For } from "solid-js";
import { Portal } from "solid-js/web";
import { useDispatch } from "../ui-events";
import IconButton, {
  type IconButtonSize,
  type IconButtonVariant,
} from "../ui/IconButton";

const ITEM =
  "flex h-8.5 items-center gap-2.5 rounded-1.5 px-2.5 text-body data-[highlighted]:bg-secondary";

/** 項目の値。デッキの id と「編集」がぶつからないよう、デッキには接頭辞を付ける。 */
const deckValue = (id: string) => `deck:${id}`;

/**
 * デッキを切り替えるメニュー。並べたデッキから選ぶと開き、最後の項目から
 * デッキの追加・名前の変更・削除をするパネルを開く。
 */
const DeckMenu: Component<{
  decks: readonly Pick<Deck, "id" | "name">[];
  activeId: string;
  size: IconButtonSize;
  /** 編集のパネルを開いている間は `filled`（サイドバーのほかのボタンと同じ）。 */
  variant: IconButtonVariant;
  /** Storybook で、開いた姿を並べるため。 */
  defaultOpen?: boolean;
}> = (props) => {
  const dispatch = useDispatch();
  const activeName = () =>
    props.decks.find((deck) => deck.id === props.activeId)?.name ?? "";
  return (
    <Menu.Root
      lazyMount
      unmountOnExit
      defaultOpen={props.defaultOpen}
      onSelect={(details) => {
        if (details.value === "edit") {
          dispatch({ type: "deck/open-panel", panel: "decks" });
          return;
        }
        const deck = props.decks.find(
          (deck) => deckValue(deck.id) === details.value,
        );
        if (deck) dispatch({ type: "deck/switch-deck", id: deck.id });
      }}
    >
      <Menu.Trigger
        asChild={(trigger) => (
          <IconButton
            {...trigger()}
            size={props.size}
            variant={props.variant}
            icon="i-material-symbols:dashboard-outline-rounded"
            label={`デッキを切り替える（いまは「${activeName()}」）`}
          />
        )}
      />
      <Portal>
        <Menu.Positioner>
          <Menu.Content class="motion-pop c-primary w-max min-w-48 max-w-72 rounded-2.5 border border-primary bg-primary p-1.5 shadow-lg outline-none">
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel class="c-secondary px-2.5 py-1 text-caption">
                デッキ
              </Menu.ItemGroupLabel>
              <For each={props.decks}>
                {(deck) => (
                  <Menu.Item
                    value={deckValue(deck.id)}
                    class={ITEM}
                    aria-current={
                      deck.id === props.activeId ? "true" : undefined
                    }
                  >
                    <span
                      class="i-material-symbols:check-rounded size-4.5 shrink-0"
                      classList={{
                        "c-accent-5": deck.id === props.activeId,
                        invisible: deck.id !== props.activeId,
                      }}
                      aria-hidden="true"
                    />
                    <span class="min-w-0 truncate">{deck.name}</span>
                  </Menu.Item>
                )}
              </For>
            </Menu.ItemGroup>
            <Menu.Separator class="my-1 border-primary border-t" />
            <Menu.Item value="edit" class={ITEM}>
              <span
                class="i-material-symbols:edit-outline-rounded c-secondary size-4.5 shrink-0"
                aria-hidden="true"
              />
              デッキを編集
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};

export default DeckMenu;
