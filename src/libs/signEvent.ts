import {
  type NostrEvent,
  type UnsignedEvent,
  getEventHash,
  verifyEvent,
} from "nostr-tools";
import { useNIP07 } from "./useNIP07";

// TODO: use wasm?

export const signEvent = async (e: UnsignedEvent): Promise<NostrEvent> => {
  const id = getEventHash(e);
  const preSigned = { ...e, id };

  const signedEvent = await useNIP07().signEvent(preSigned);

  if (!verifyEvent({ ...signedEvent, id })) {
    throw new Error("nostr.signEvent returned an invalid event");
  }

  return signedEvent;
};
