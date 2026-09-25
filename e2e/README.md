# E2E

ふつうの人がする主な操作の流れが通ることを、実際のブラウザで確かめる。見た目や崩れやすい端の状態は Storybook で見るので、ここでは見ない。

## 走らせる

```sh
vp exec --filter @streets/e2e playwright install chromium   # 初回だけ
vp run e2e                                                   # 全部
vp run @streets/e2e#test:e2e --project=nip07 tests/post.spec.ts   # 絞る
```

[nak](https://github.com/fiatjaf/nak) が要る。リレー（`nak serve`、10557）は globalSetup が立て、アプリは開発サーバー（5183）で動かす。どちらも手元の開発用（10547・5173）とは別のポートにしてある。すでに立っていれば使い回す。

## 仕組み

- **読み書き先はテスト用のリレーだけ。** `?relays=ws://localhost:10557` で開き（開発時だけ効く）、localhost 以外への WebSocket は `context.routeWebSocket` で閉じる。公開リレーの状態でテストの結果が変わらないようにするため
- **リレーは走らせている間ずっと同じ。** テストごとに新しい鍵の人（`createUser`）を作って、テスト同士の状態を分ける。前のテストが書いたものを前提にしない
- **ログイン方法ごとに project を分ける。** `nip07`・`bunker`・`nostrconnect` の 3 つ。同じテストが全方式で走るので、テストの中でログイン方法を分岐させない
  - `nip07`: 偽の `window.nostr`。署名は Node の側でテスト用の鍵を使って行う
  - `bunker`: `nak bunker` を立て、`bunker://` を貼る
  - `nostrconnect`: 画面に出た `nostrconnect://` へ `nak bunker connect` で繋ぐ
- **別の人の動きは、アプリを通さずにリレーへ直接書く**（`user.post(...)`）。別のクライアントや別の端末を模すのと同じ

## 書き方

- 使う fixture は `src/fixtures.ts` の `test` から取る（`me`・`openApp`・`signIn`・`signer`）。`@playwright/test` の `test` を直に使わない
- 書き込みは、画面に出たかに加えて、`waitForEvent` でリレーに届いたイベントの中身（kind・タグ・本文）まで確かめる。画面だけ見ていると、タグが壊れていても通ってしまう
- 要素は役割と名前（`getByRole("button", { name: "投稿" })`）で探す。クラス名や DOM の形に頼らない。名前で探せない要素があるなら、テストのために `data-testid` を足さず、まず画面側に `aria-label` が要らないかを考える
- 待つのは `expect(...).toBeVisible()` などの自動で待つ形にする。`waitForTimeout` で決め打ちに待たない
- 1 本のテストは 1 つの操作の流れにする。前のテストの状態を引き継がない
- 署名器を止める・拒否させるのは `signer.set("hang" | "reject")`。nak の署名器には拒否させられないので、`reject` は `nip07` の project でだけ使う（`test.skip` で外す）
