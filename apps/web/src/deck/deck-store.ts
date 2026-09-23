import {
  type Deck,
  deckStorageKey,
  defaultDeck,
  loadDeck,
  saveDeck,
} from "@streets/core/deck/deck";
import {
  type CreateNip78DocumentOptions,
  type Nip78Document,
  type Nip78DocumentDefinition,
  createNip78Document,
} from "@streets/core/solid/create-nip78-document";
import { WELCOME_RELAYS } from "../welcome/welcome-relays";

export const DECK_EVENT_IDENTIFIER = "moe.eyemono.streets/deck";

/**
 * kind:30078 の同期機構へ、デッキ固有の識別子と codec だけを渡す。
 * キャッシュ・競合・保存キューはこの module では扱わない。
 */
const deckDocumentDefinition = {
  identifier: DECK_EVENT_IDENTIFIER,
  cacheKey: deckStorageKey,
  initial: (_) => defaultDeck(WELCOME_RELAYS),
  serialize: saveDeck,
  parse: (raw) => loadDeck(raw),
  equals: (left, right) => saveDeck(left) === saveDeck(right),
  migrateLegacy: (raw) => loadDeck(raw),
} satisfies Nip78DocumentDefinition<Deck>;

export type DeckStore = Nip78Document<Deck>;

export const createDeckStore = (
  options: Omit<CreateNip78DocumentOptions<Deck>, "definition">,
): DeckStore =>
  createNip78Document({ ...options, definition: deckDocumentDefinition });
