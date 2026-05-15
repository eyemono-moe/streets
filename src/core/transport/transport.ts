import type { NostrEvent } from "nostr-tools";
import type { EventParameters } from "nostr-typedef";
import type { Observable } from "rxjs";

export type RelayUrl = string;

export type NostrTransportMode = "backward" | "forward";

export type NostrTransportFilter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number | (() => number);
  until?: number | (() => number);
  limit?: number;
  search?: string;
  [tag: `#${string}`]: string[] | undefined;
};

export type NostrTransportRelayOptions = {
  relays?: readonly RelayUrl[];
  defaultReadRelays?: boolean;
  defaultWriteRelays?: boolean;
};

export type NostrTransportSubscribeOptions = NostrTransportRelayOptions & {
  filters: NostrTransportFilter | readonly NostrTransportFilter[];
  mode?: NostrTransportMode;
};

export type NostrTransportPublishOptions = NostrTransportRelayOptions;

export type NostrTransportEventPacket = {
  type: "EVENT";
  from: RelayUrl;
  subId: string;
  event: NostrEvent;
};

export type NostrTransportConnectionState =
  | "initialized"
  | "connecting"
  | "connected"
  | "waiting-for-retrying"
  | "retrying"
  | "dormant"
  | "error"
  | "rejected"
  | "terminated";

export type NostrTransportConnectionStatePacket = {
  from: RelayUrl;
  state: NostrTransportConnectionState;
};

export type NostrTransportMessagePacket = {
  from: RelayUrl;
  type: string;
  message?: unknown;
  [key: string]: unknown;
};

export type NostrTransportPublishPacket = {
  from: RelayUrl;
  type: "OK";
  eventId: string;
  ok: boolean;
  done: boolean;
  notice?: string;
};

export interface NostrSubscription {
  readonly events$: Observable<NostrTransportEventPacket>;
  emit(filters: NostrTransportFilter | readonly NostrTransportFilter[]): void;
  close(): void;
}

export interface NostrTransport {
  setDefaultRelays(relays: readonly RelayUrl[]): void;
  subscribe(options: NostrTransportSubscribeOptions): NostrSubscription;
  publish(
    event: EventParameters,
    options?: NostrTransportPublishOptions,
  ): Observable<NostrTransportPublishPacket>;
  observeMessages(): Observable<NostrTransportMessagePacket>;
  observeConnectionState(): Observable<NostrTransportConnectionStatePacket>;
  dispose(): void;
}
