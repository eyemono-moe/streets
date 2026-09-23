import { welcomeRelays } from "@streets/core/deck/welcome-feed";

/** 入口の流れと、新規ユーザーの既定デッキのリレーカラムが同じものを読む。 */
export const WELCOME_RELAYS = welcomeRelays(
  import.meta.env.VITE_WELCOME_RELAYS,
);
