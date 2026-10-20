import type { EventDraft } from "@streets/core/nostr/build/draft";
import type { RelayUrl } from "@streets/core/relay/relay-connection";
import type { WriteResult } from "@streets/core/write/writer";
import { createContext, useContext } from "solid-js";

/**
 * アップレットに頼まれた書き込みを、Streets の書き手に通す口。ログインしていて
 * 署名できるときだけデッキが渡す。
 */
export type AppletWriter = {
  publish: (
    draft: EventDraft,
    relays: readonly RelayUrl[],
    label: string,
  ) => Promise<WriteResult>;
  /** NIP-44 で暗号化する。署名器が持たなければ undefined。 */
  encrypt?: (recipient: string, plaintext: string) => Promise<string>;
};

const AppletWriterContext = createContext<AppletWriter>();

export const AppletWriterProvider = AppletWriterContext.Provider;

/** ログインしていなければ undefined。書き込みは断る。 */
export const useAppletWriter = (): AppletWriter | undefined =>
  useContext(AppletWriterContext);
