# Local Nostr Development and Seeding

The local development environment should make Nostr edge cases repeatable. Keep the existing Docker relay and asset-server setup, then extend it gradually.

## Target Commands

Candidate scripts:

```json
{
  "dev:env": "docker compose -f dev/docker-compose.yml up",
  "dev:reset": "tsx dev/seeds/reset.ts",
  "dev:seed": "tsx dev/seeds/push.ts basic",
  "dev:seed:all": "tsx dev/seeds/push.ts all",
  "dev:seed:heavy": "tsx dev/seeds/push.ts heavy-timeline"
}
```

Exact command names can change during implementation, but they should remain stable once documented.

## Seed Principles

- Fixed keys.
- Fixed timestamps.
- Stable event parameters and event ids.
- Explicit relay placement per event.
- Scenarios small enough to debug by hand.

## Required Scenarios

- `basic`: profiles, contact list, notes, replies, reposts, reactions, quotes.
- `relay-edge-cases`: duplicated event across relays, missing relay data, delayed EOSE, CLOSED, AUTH, low `max_subscriptions`.
- `replaceable-events`: old/new kind:0 and kind:3 events, NIP-65 relay lists, parameterized replaceable events.
- `timeline-edge-cases`: same timestamps, future events, old events, muted users, deleted events, missing quote/reply targets.
- `asset-edge-cases`: normal, slow, missing, huge, broken, and blurhash-backed assets.

## Agent Skill/Command Workstream

Add Nostr-focused skills or commands after the basic seed tooling exists. They should let agents run the same deterministic scenarios instead of inventing ad-hoc relay setup each time.
