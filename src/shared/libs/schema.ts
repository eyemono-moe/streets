import { nip19 } from "nostr-tools";
import { BECH32_REGEX } from "nostr-tools/nip19";
import * as v from "valibot";
import { useI18n } from "../../i18n";

const t = useI18n();

export const pubkeySchema = v.union([
  // hex
  v.pipe(v.string(), v.hash(["sha256"], t("error.invalidID"))),
  // bech32
  v.pipe(
    v.string(),
    v.regex(BECH32_REGEX),
    v.rawTransform(({ dataset, addIssue, NEVER }) => {
      try {
        const decoded = nip19.decode(dataset.value);
        switch (decoded.type) {
          case "nprofile":
            return decoded.data.pubkey;
          case "npub":
            return decoded.data;
          default: {
            addIssue({
              expected: "nprofile or npub",
              input: dataset.value,
              message: t("error.invalidPubkey"),
            });
            return NEVER;
          }
        }
      } catch (e) {
        addIssue({
          expected: "valid bech32",
          input: dataset.value,
          message: t("error.invalidPubkey"),
        });
        return NEVER;
      }
    }),
  ),
]);
