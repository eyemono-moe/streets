import type { RelayUrl } from "../../relay/relay-connection";
import type { EventDraft } from "./draft";

/** NIP-42 の認証イベント。リレーは broadcast しないので、署名しても人目には出ない。 */
export const buildRelayAuth = (
  relay: RelayUrl,
  challenge: string,
): EventDraft => ({
  kind: 22_242,
  tags: [
    ["relay", relay],
    ["challenge", challenge],
  ],
  content: "",
});

/** NIP-42 の `OK` / `CLOSED` の前置き。認証すれば通るかもしれない、の印。 */
export const isAuthRequired = (reason: string): boolean =>
  reason.startsWith("auth-required:");
