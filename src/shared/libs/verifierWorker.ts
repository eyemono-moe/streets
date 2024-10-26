import { Event, loadWasmSync } from "@rust-nostr/nostr";
import {
  type EventVerifier,
  startVerificationServiceHost,
} from "rx-nostr-crypto";

loadWasmSync();

const verifier: EventVerifier = async (e) => {
  try {
    return Event.fromJson(JSON.stringify(e)).verify();
  } catch (e) {
    console.error(e);
    return false;
  }
};

startVerificationServiceHost(verifier);
