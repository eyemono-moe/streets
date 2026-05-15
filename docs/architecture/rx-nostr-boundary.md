# rx-nostr Boundary

`rx-nostr` remains the relay transport engine, but it should not be treated as global application state.

## Rule

Most application code should depend on `NostrTransport`, not on `rx-nostr` directly.

## Allowed Direct Usage

Direct `rx-nostr` usage should be limited to adapter/provider code such as:

- `src/core/transport/rx-nostr-transport.ts`
- transitional compatibility wiring under existing providers
- devtools that explicitly inspect relay transport state

## Transport Interface Shape

The transport should expose application-level operations:

```ts
export interface NostrTransport {
  subscribe(req: PlannedReq): SubscriptionHandle
  send(event: EventParameters, opts?: SendOptions): Observable<PublishResult>
  observeAllEvents(): Observable<RelayEventPacket>
  observeConnectionState(): Observable<RelayConnectionStatePacket>
  observeOutgoing(): Observable<OutgoingRelayMessagePacket>
  dispose(): void
}
```

## Migration Notes

- Keep existing providers working while adding the adapter.
- Move call sites gradually through compatibility wrappers.
- Do not rewrite relay subscription mechanics by hand.
- Keep backward requests and forward/live requests distinct.
- Query planning, relay selection, filter merge, and related-event policy belong above the transport layer.
