<div align="center">
  <a href="https://streets.eyemono.moe" target="_blank" rel="noopener noreferrer">
    <picture>
      <source srcset="src/assets/streets_logo_full_dark.min.svg" media="(prefers-color-scheme: dark)" />
      <img src="src/assets/streets_logo_full_light.min.svg" alt="streets logo" height="100" />
    </picture>
  </a>
  <p align="center">
    Column-based nostr client for web
    <br />
    <a href="https://streets.eyemono.moe" target="_blank" rel="noopener noreferrer"><strong>Step into the Streets</strong></a>
    <br />
    <br />
    <a href="https://github.com/eyemono-moe/streets/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    ·
    <a href="https://github.com/eyemono-moe/streets/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

![Streets screenshot](/.github/assets/screenshot.png)

Streets はブラウザで使える Nostr のクライアントです。タイムライン、通知、検索結果などのカラムを組み合わせて、自分だけの画面を組み立てられます。

### Built With

[![TypeScript][typescript-image]][typescript-url]
[![SolidJS][solidjs-image]][solidjs-url]
[![Vite][vite-image]][vite-url]

## Development

コードを変える前に [AGENTS.md](./AGENTS.md) を読んでください。構成・画面の組み立て方・テストと検証の決まりをまとめてあります。

コマンドは [Vite+](https://viteplus.dev/)（`vp`）から呼びます。pnpm は `vp` が裏で使うので、直に呼びません。

```bash
vp install

vp run dev # development（http://localhost:5173）

vp run build # production

vp run storybook # UI カタログ（http://localhost:6006、ローカルリレー不要）

vp run verify # 静的検査・型検査・単体テスト・本体のビルド
```

### setup local relay and file server

```bash
docker compose up -d
```

This will start the following services:

- [nostr-rs-relay](https://github.com/scsibug/nostr-rs-relay): `ws://localhost:8080` と `ws://localhost:8081`（2 本）
- [blossom-server](https://github.com/hzrd149/blossom-server): `http://localhost:8090`（画像のアップロード先 / NIP-B7）

リレーだけを立てるなら `docker compose up -d nostr-rs-relay nostr-rs-relay-2`。スレッドのいろいろな形の投稿を入れるには `vp run seed:dev` を使います。

画像のアップロード先だけを立てるなら `docker compose up -d blossom`。アプリ側は
設定 →「画像」で `http://localhost:8090` を足すと、ここへアップロードするようになります
（アップロードしたものは `GET http://localhost:8090/list/<自分の pubkey>` で一覧できます）。

### スクリーンショット用の環境

宣伝用のスクリーンショットを撮るときは、架空の人たちの投稿を入れたリレーを立てられます
（[nak](https://github.com/fiatjaf/nak) が要ります）。

```bash
vp run screenshot many-columns --time "2026-09-23T19:00:00+09:00"
```

シナリオの一覧と書き足し方は [tools/screenshot/README.md](./tools/screenshot/README.md) にあります。

### Sentry（壊れたときの報告）

`VITE_SENTRY_DSN` を渡してビルドすると、壊れたときに Sentry へ送ります。渡さなければ何も送らず、SDK も配りません（開発中も送りません）。

```bash
VITE_SENTRY_DSN=https://xxxx@o0.ingest.sentry.io/0 VITE_SENTRY_ENV=preview vp run build
```

送る前に、鍵・公開鍵・イベント id を落とします（`packages/core/src/telemetry/scrub.ts`）。IP アドレスや Cookie は送りません。

ソースマップを送ると、本番のスタックトレースが元のコードで読めます。次の 3 つが揃ったビルドでだけ送ります（`VITE_` を付けないこと。付けると画面側へ混ざります）。

```bash
SENTRY_AUTH_TOKEN=... SENTRY_ORG=... SENTRY_PROJECT=streets vp run build
```

送ったマップは配らずに消すので、公開されるものは変わりません。送れなかったときは警告を出して、ビルドは続けます。

### Contact

- eyemono.moe: <nostr:npub1m0n0eyetgrflxghneeckkv95ukrn0fdpzyysscy4vha3gm64739qxn23sk>

## Acknowledgments

- [rx-nostr](https://github.com/penpenpng/rx-nostr)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- [rabbit](https://github.com/syusui-s/rabbit)
- [nostter](https://github.com/SnowCait/nostter)
- [nostr-zap](https://github.com/SamSamskies/nostr-zap)

[typescript-image]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org/
[solidjs-image]: https://img.shields.io/badge/SolidJS-2c4f7c?style=for-the-badge&logo=solid&logoColor=white
[solidjs-url]: https://www.solidjs.com/
[vite-image]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[vite-url]: https://vitejs.dev/
