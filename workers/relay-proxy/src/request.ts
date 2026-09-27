import * as v from "valibot";

/** 1 回に送れるリレーの数。トークンが漏れても、多くのリレーへ撒く踏み台にさせない。 */
const MAX_RELAYS = 20;

/** 署名済みのイベント。中身は確かめずにそのまま渡す（署名はリレーが確かめる）。 */
const EventSchema = v.looseObject({
  id: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  pubkey: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
  sig: v.pipe(v.string(), v.regex(/^[0-9a-f]{128}$/)),
  kind: v.number(),
  created_at: v.number(),
  tags: v.array(v.array(v.string())),
  content: v.string(),
});

const RequestSchema = v.object({
  event: EventSchema,
  relays: v.pipe(
    v.array(v.pipe(v.string(), v.url(), v.startsWith("wss://"))),
    v.minLength(1),
    v.maxLength(MAX_RELAYS),
  ),
});

export type RelayRequest = v.InferOutput<typeof RequestSchema>;

export const parseRelayRequest = (input: unknown): RelayRequest =>
  v.parse(RequestSchema, input);
