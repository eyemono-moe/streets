import {
  type Deck,
  FIRST_DECK_ID,
  FIRST_DECK_NAME,
} from "@streets/core/deck/deck";
import { t } from "../i18n/locale";

/** 画面に出すデッキの名前。名前を変えていない最初のデッキは、言語に合わせて呼ぶ。 */
export const deckName = (deck: Pick<Deck, "id" | "name">): string =>
  deck.id === FIRST_DECK_ID && deck.name === FIRST_DECK_NAME
    ? t("deck.firstDeckName")
    : deck.name;
