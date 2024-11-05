# Streets :motorway:

Column based nostr client

## Getting Started

build with [Solid](https://solidjs.com)

## Deployment

```bash
pnpm install

pnpm run dev # development

pnpm run build # production
```

### setup local relay and file server

```bash
docker compose up -d
```

- nostr-rs-relay: `ws://localhost:8080`
- nostrcheck: `http://localhost:3000`
