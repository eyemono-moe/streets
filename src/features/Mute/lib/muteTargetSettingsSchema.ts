import * as v from "valibot";

export const muteTargetSettingsSchema = v.object({
  // TODO: check if valid event id
  events: v.optional(
    v.pipe(
      v.array(v.string()),
      v.transform((v) => v.filter((t) => t !== "").map((t) => t.trim())),
    ),
    [],
  ),
  // TODO: check if valid pubkey
  users: v.optional(
    v.pipe(
      v.array(v.string()),
      v.transform((v) => v.filter((t) => t !== "").map((t) => t.trim())),
    ),
    [],
  ),
  hashtags: v.optional(
    v.pipe(
      v.array(v.string()),
      v.transform((v) =>
        v
          .filter((t) => t !== "")
          .map((t) => {
            const trimmed = t.trim();
            // 先頭に#があれば削除
            return trimmed.replace(/^#+/, "");
          }),
      ),
    ),
    [],
  ),
  words: v.optional(
    v.pipe(
      v.array(v.string()),
      v.transform((v) => v.filter((t) => t !== "").map((t) => t.trim())),
    ),
    [],
  ),
});

export type MuteTargetSettingsInput = v.InferInput<
  typeof muteTargetSettingsSchema
>;
