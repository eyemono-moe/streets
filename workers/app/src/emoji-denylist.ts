/**
 * 消してほしいと頼まれた絵文字。URL（`https://emoji.streets.eyemono.moe/v1/…`）の SHA-256 を
 * 16 進数で書く。足すと、同じ指定ではもう作られない。手順は docs/emoji-maker.md。
 */
export const DENIED_EMOJI_HASHES: ReadonlySet<string> = new Set<string>([]);
