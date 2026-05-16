# Local Development and Seed Scenarios

[Back to v1 design index](../nostr-client-core-design-v1.md)

Local relay, asset server, deterministic seed scenarios, and development harness direction.

## In this file

- [Local Development Environment](#local-development-environment)
- [Seed Scenario Design](#seed-scenario-design)

---

## Local Development Environment

The project should support deterministic local development with Docker-based relays and an asset server.

Existing Docker relay/asset-server setup should be kept and extended, not replaced.

### Desired Commands

```json
{
  "scripts": {
    "dev:env": "docker compose -f dev/docker-compose.yml up",
    "dev:reset": "tsx dev/seeds/reset.ts",
    "dev:seed": "tsx dev/seeds/push.ts basic",
    "dev:seed:all": "tsx dev/seeds/push.ts all",
    "dev:seed:heavy": "tsx dev/seeds/push.ts heavy-timeline",
    "dev:e2e": "pnpm dev:reset && pnpm dev:seed:all && playwright test"
  }
}
```

### Local Relay Setup

Use multiple local relays, not just one.

```txt
relay-a:
  Normal relay.

relay-b:
  Slow or partial relay.
  Some events are intentionally missing.
  EOSE may be delayed.

relay-c:
  Strict relay.
  Small max_subscriptions.
  Small max_limit.
  AUTH/CLOSED behavior can be tested.
```

Example NIP-11 limitation for a strict relay:

```json
{
  "name": "local limited relay",
  "supported_nips": [1, 11],
  "limitation": {
    "max_subscriptions": 1,
    "max_limit": 50
  }
}
```

This is useful for confirming that `rx-nostr` queue behavior works correctly under low subscription limits.

### Asset Server

The local asset server should provide both normal and broken assets.

Suggested endpoints:

```txt
/assets/avatar/alice.png
/assets/avatar/bob.png
/assets/avatar/broken.png
/assets/avatar/slow.png?delay=3000
/assets/avatar/large.jpg
/assets/avatar/404.png
/assets/banner/alice.png
```

Use this to test:

```txt
- Normal avatar loading
- 404 images
- Slow images
- Large images
- Broken files
- CORS behavior
- blurhash fallback
```

---

## Seed Scenario Design

Seed data should be deterministic.

Use fixed keys, fixed timestamps, and stable event parameters so event ids remain stable between runs.

### Suggested Directory

```txt
dev/seeds/
  scenarios/
    basic.ts
    heavy-timeline.ts
    relay-edge-cases.ts
    replaceable-events.ts
    timeline-edge-cases.ts
    asset-edge-cases.ts
    deletion.ts
  keys.ts
  generate.ts
  push.ts
  reset.ts
```

### Seed DSL Sketch

```ts
const alice = user("alice")
const bob = user("bob")

scenario("basic", ({ event, relay, asset }) => {
  asset.image("alice-avatar", "avatars/alice.png")

  event.metadata(alice, {
    name: "Alice",
    picture: asset.url("alice-avatar"),
  })

  event.contacts(me, [alice, bob])

  event.note(alice, {
    content: "hello",
    relays: ["relay-a", "relay-b"],
  })

  event.reply(bob, {
    root: "alice-note-1",
    content: "reply",
    relays: ["relay-b"],
  })
})
```

### Scenario: `basic`

Should include:

```txt
- Self user
- 5 followees
- kind:0 metadata
- kind:3 contact list
- kind:1 note
- Reply
- Repost
- Reaction
- Quote
```

### Scenario: `relay-edge-cases`

Should include:

```txt
- Event only on relay A
- Event only on relay B
- Same event duplicated across relays
- Slow EOSE relay
- Relay returning CLOSED
- AUTH-required relay
- Relay with max_subscriptions = 1
```

### Scenario: `replaceable-events`

Should include:

```txt
- Old kind:0 metadata
- New kind:0 metadata
- Old kind:3 contact list
- New kind:3 contact list
- kind:10002 relay list metadata
- Parameterized replaceable events
```

### Scenario: `timeline-edge-cases`

Should include:

```txt
- Events with same created_at
- Future created_at event
- Very old event
- High-volume author
- Muted user
- Deleted event
- Reply target missing
- Quote target only available on another relay
```

### Scenario: `asset-edge-cases`

Should include:

```txt
- Valid avatar
- 404 avatar
- Slow avatar
- Huge image
- Broken image
- Image with blurhash
- Image without blurhash
```

---

## Related Files

- [Migration Plan](./migration-plan.md)
- [Overview](./overview.md)
