import { type NostrEvent, verifyEvent } from "../nostr/event";
import type { RelayUrl } from "../relay/relay-connection";

export type StoredEvent = {
  event: NostrEvent;
  seenRelays: RelayUrl[];
};

export type PutResult = "inserted" | "duplicate" | "rejected";

/**
 * 同期・メモリのイベント保管。
 * IndexedDB による永続化は後続の計画で「背後の水和・退避層」として足す (ADR-0018)。
 */
export class EventStore {
  readonly #events = new Map<string, StoredEvent>();

  get size(): number {
    return this.#events.size;
  }

  put(event: NostrEvent, relay: RelayUrl): PutResult {
    const existing = this.#events.get(event.id);
    if (existing) {
      if (!existing.seenRelays.includes(relay)) existing.seenRelays.push(relay);
      return "duplicate";
    }

    // リレーは信用できない。全件検証する。
    if (!verifyEvent(event)) return "rejected";

    this.#events.set(event.id, { event, seenRelays: [relay] });
    return "inserted";
  }

  get(id: string): NostrEvent | undefined {
    return this.#events.get(id)?.event;
  }

  seenRelays(id: string): RelayUrl[] {
    return this.#events.get(id)?.seenRelays ?? [];
  }
}
