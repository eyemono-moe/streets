import {
  DECK_EVENT_IDENTIFIER,
  type DeckSet,
  activeDeckStorageKey,
  deckStorageKey,
  defaultDeckSet,
  loadDeckSet,
  saveDeckSet,
} from "@streets/core/deck/deck";
import {
  GUEST_DECK_STORAGE_KEY,
  guestDeckSet,
} from "@streets/core/deck/guest-deck";
import {
  type CreateNip78DocumentOptions,
  type Nip78Document,
  type Nip78DocumentDefinition,
  createNip78Document,
} from "@streets/core/solid/create-nip78-document";
import { createSignal } from "solid-js";
import { WELCOME_RELAYS } from "../welcome/welcome-relays";

export { DECK_EVENT_IDENTIFIER };

/**
 * kind:30078 の同期機構へ、デッキ固有の識別子と codec だけを渡す。
 * キャッシュ・競合・保存キューはこの module では扱わない。
 */
const deckDocumentDefinition = {
  identifier: DECK_EVENT_IDENTIFIER,
  cacheKey: deckStorageKey,
  initial: (_) => defaultDeckSet(WELCOME_RELAYS),
  serialize: saveDeckSet,
  parse: (raw) => loadDeckSet(raw),
  equals: (left, right) => saveDeckSet(left) === saveDeckSet(right),
  migrateLegacy: (raw) => loadDeckSet(raw),
} satisfies Nip78DocumentDefinition<DeckSet>;

export type DeckStore = Nip78Document<DeckSet>;

/**
 * ログインしていない人のデッキ。署名できないのでアカウントへは保存せず、この端末に
 * だけ置く。ログインしたらその人のデッキを開き、これは引き継がない。
 */
export const createGuestDeckStore = (storage: Storage): DeckStore => {
  const load = (): DeckSet => {
    try {
      const raw = storage.getItem(GUEST_DECK_STORAGE_KEY);
      const parsed = raw === null ? undefined : loadDeckSet(raw);
      if (parsed) return parsed;
    } catch {
      // 読めなくても既定のデッキで始める。
    }
    return guestDeckSet(WELCOME_RELAYS);
  };
  const [value, setValue] = createSignal(load());
  return {
    value,
    state: () => ({ phase: "ready", sync: "synced" }),
    update: (change) => {
      const next = change(value());
      setValue(next);
      try {
        storage.setItem(GUEST_DECK_STORAGE_KEY, saveDeckSet(next));
      } catch {
        // 覚えられなくても、今の画面には当てる。
      }
    },
    refresh: async () => {},
    keepLocal: async () => {},
    useRemote: () => {},
  };
};

export const createDeckStore = (
  options: Omit<CreateNip78DocumentOptions<DeckSet>, "definition">,
): DeckStore =>
  createNip78Document({ ...options, definition: deckDocumentDefinition });

/** この端末で開いていたデッキの id。覚えていなければ undefined（先頭のデッキを開く）。 */
export const savedActiveDeckId = (pubkey: string): string | undefined => {
  try {
    return localStorage.getItem(activeDeckStorageKey(pubkey)) ?? undefined;
  } catch {
    return undefined;
  }
};

export const saveActiveDeckId = (pubkey: string, id: string): void => {
  try {
    localStorage.setItem(activeDeckStorageKey(pubkey), id);
  } catch {
    // 覚えられなくても、次に開いたときに先頭のデッキが開くだけ。
  }
};
