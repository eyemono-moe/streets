import { type ParentComponent, createContext, useContext } from "solid-js";
import {
  type Deck,
  deckStorageKey,
  defaultDeck,
  loadDeck,
  saveDeck,
} from "../../core/deck/deck";
import {
  type CreateNip78DocumentOptions,
  type Nip78Document,
  type Nip78DocumentDefinition,
  createNip78Document,
} from "../../core/solid/create-nip78-document";

export const DECK_EVENT_IDENTIFIER = "moe.eyemono.streets/deck";

/**
 * kind:30078 の同期機構へ、デッキ固有の識別子と codec だけを渡す。
 * キャッシュ、暗号化、競合、保存キューはこの module では扱わない。
 */
export const deckDocumentDefinition = {
  identifier: DECK_EVENT_IDENTIFIER,
  cacheKey: deckStorageKey,
  initial: defaultDeck,
  serialize: saveDeck,
  parse: (raw) => loadDeck(raw),
  equals: (left, right) => saveDeck(left) === saveDeck(right),
  migrateLegacy: (raw) => loadDeck(raw),
} satisfies Nip78DocumentDefinition<Deck>;

export type DeckStore = Nip78Document<Deck>;

export const createDeckStore = (
  options: Omit<CreateNip78DocumentOptions<Deck>, "definition">,
): DeckStore =>
  createNip78Document({
    ...options,
    definition: deckDocumentDefinition,
  });

const DeckStoreContext = createContext<DeckStore>();

export const DeckStoreProvider: ParentComponent<{ value: DeckStore }> = (
  props,
) => (
  <DeckStoreContext.Provider value={props.value}>
    {props.children}
  </DeckStoreContext.Provider>
);

export const useOptionalDeckStore = (): DeckStore | undefined =>
  useContext(DeckStoreContext);

export const useDeckStore = (): DeckStore => {
  const store = useOptionalDeckStore();
  if (!store) {
    throw new Error("DeckStoreProvider の内側で使用してください");
  }
  return store;
};
