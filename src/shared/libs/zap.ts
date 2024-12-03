import { bech32 } from "bech32";
import { NIP05_REGEX } from "nostr-tools/nip05";
import * as v from "valibot";

const utf8decoder = new TextDecoder("utf-8");

export const lud06 = v.pipe(
  v.string(),
  v.check((input) => {
    try {
      const { prefix, words } = bech32.decode(input, 1000);
      if (prefix.toLowerCase() !== "lnurl") {
        return false;
      }
      const data = bech32.fromWords(words);
      utf8decoder.decode(new Uint8Array(data));
      return true;
    } catch {
      return false;
    }
  }),
);
export const isLud06 = (input: string) => v.safeParse(lud06, input).success;

export const lud16 = v.pipe(v.string(), v.regex(NIP05_REGEX));
export const isLud16 = (input: string) => v.safeParse(lud16, input).success;
