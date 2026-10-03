import type { RelayUrl } from "../relay/relay-connection";
import { normalizeRelayUrl } from "../relay/relay-url";
import type { RelayListState } from "../settings/relay-list-state";
import { columnChosenRelays } from "./column-kinds";
import type { DeckSet } from "./deck";

/**
 * ユーザーが自分で選んだリレー。手元のリレー（localhost など）でも、ここに
 * 入っているものには繋ぐ。他人の relay list や投稿のヒントは含めない。
 */
export const chosenRelays = (input: {
  relayList: RelayListState;
  searchRelays: readonly RelayUrl[];
  decks: DeckSet | undefined;
}): RelayUrl[] => {
  const raw = [
    ...(input.relayList.phase === "ready"
      ? input.relayList.entries.map((entry) => entry.url)
      : []),
    ...input.searchRelays,
    ...(input.decks?.decks ?? []).flatMap((deck) =>
      deck.columns.flatMap(columnChosenRelays),
    ),
  ];
  return [...new Set(raw.flatMap((url) => normalizeRelayUrl(url) ?? []))];
};
