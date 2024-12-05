import { type NostrEvent, kinds } from "nostr-tools";
import { NIP05_REGEX } from "nostr-tools/nip05";
import * as v from "valibot";
import type { Translator } from "../../../i18n";
import { isLud06, isLud16, lud06, lud16 } from "../zap";

const fallbackUnknown = <TIn, TOut, TIssue>(
  s: v.BaseSchema<TIn, TOut, v.BaseIssue<TIssue>>,
) =>
  v.union([
    s,
    v.pipe(
      v.unknown(),
      v.transform(() => undefined),
    ),
  ]);

// TODO: NIP-57

// https://github.com/nostr-protocol/nips/blob/master/01.md#kinds
const NIP01 = v.object({
  name: v.nullish(v.string(), ""),
  about: v.nullish(v.string(), ""),
  picture: v.nullish(v.string(), () => undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/05.md
const NIP05 = v.object({
  nip05: v.nullish(fallbackUnknown(v.string()), () => undefined),
});

const strBoolean = v.pipe(
  v.union([v.literal("true"), v.literal("false")]),
  v.transform((input) => input === "true"),
);

// https://github.com/nostr-protocol/nips/blob/master/24.md#kind-0
const NIP24 = v.object({
  display_name: v.nullish(v.string(), () => undefined),
  website: v.nullish(v.string(), () => undefined),
  banner: v.nullish(v.string(), () => undefined),
  bot: v.nullish(v.union([v.boolean(), strBoolean]), () => undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/24.md#deprecated-fields
const NIP24Deprecated = v.object({
  displayName: v.nullish(v.string(), () => undefined),
  username: v.nullish(v.string(), () => undefined),
});

// https://github.com/nostr-protocol/nips/blob/master/57.md

const NIP57 = v.object({
  lud06: v.nullish(v.string(), () => undefined),
  lud16: v.nullish(v.string(), () => undefined),
});

const metadataContentSchema = v.pipe(
  v.object({
    ...NIP01.entries,
    ...NIP05.entries,
    ...NIP24.entries,
    ...NIP24Deprecated.entries,
    ...NIP57.entries,
  }),
  v.transform((output) => ({
    ...output,
    display_name: output.display_name ?? output.displayName,
    /** @deprecated use display_name */
    displayName: output.displayName,
    /** @deprecated use name */
    username: output.username,
  })),
);

export const parseMetadata = (input: NostrEvent) => {
  if (input.kind !== kinds.Metadata) {
    throw new Error(`kind is not Metadata: ${input.kind}`);
  }
  let content: string;
  try {
    content = JSON.parse(input.content);
  } catch (e) {
    throw new Error(`failed to parse profile: ${e}`);
  }

  const res = v.safeParse(metadataContentSchema, content);
  if (res.success) {
    return { ...res.output, kind: input.kind, pubkey: input.pubkey } as const;
  }
  throw new Error(
    `failed to parse profile: ${JSON.stringify(res.issues, null, 2)}`,
  );
};

export type Metadata = ReturnType<typeof parseMetadata>;

export const profileSettingsSchema = (t: Translator) =>
  v.pipe(
    v.object({
      name: v.string(),
      about: v.string(),
      picture: v.string(),
      nip05: v.union(
        [
          v.literal(""),
          v.pipe(
            v.string(),
            v.regex(NIP05_REGEX, t("settings.profile.error.invalidNip05")),
          ),
        ],
        t("settings.profile.error.invalidNip05"),
      ),
      display_name: v.string(),
      website: v.string(),
      banner: v.string(),
      lightningAddress: v.union(
        [v.literal(""), lud06, lud16],
        t("settings.profile.error.invalidLNAddress"),
      ),
    }),
    v.transform((input) => ({
      ...input,
      lud06: isLud06(input.lightningAddress)
        ? input.lightningAddress
        : undefined,
      lud16: isLud16(input.lightningAddress)
        ? input.lightningAddress
        : undefined,
    })),
  );

export type ProfileSettingsInput = v.InferInput<
  ReturnType<typeof profileSettingsSchema>
>;
export type ProfileSettingsOutput = v.InferOutput<
  ReturnType<typeof profileSettingsSchema>
>;
