# Settings Pattern Kit と設定画面の分割 — 実装計画

**Goal:** 設定画面の外部 interface と既存動作を保ったまま、Penpot に対応する
表示 module とページへ分割し、外部接続なしで各状態を Storybook に再現する。

## 1. Settings shell と表示 pattern

- [x] Ark UI Dialog / Tabs と 880 x 640 レイアウトを `SettingsShell` へ移す
- [x] ページ見出しと本文余白を `SettingsPage` へ揃える
- [x] Ark Field を使う `SettingsTextField` を作る
- [x] Ark ToggleGroup を使う `SettingsSegmentedControl` を作る
- [x] close、外側クリック、Escape、フォーカス復帰と既存 testid を維持する

## 2. 設定ページの分割

- [x] NIP-65 の draft と保存 UI を `RelaySettingsPage` へ移す
- [x] ミュートの入力・公開範囲・保存 UI を `MuteSettingsPage` へ移す
- [x] 端末設定を `LabSettingsPage` へ移す
- [x] `SettingsDialog` の props を `onClose` のみに保つ
- [x] 利用できる Relays / Mutes / Lab だけを左ナビへ出す

## 3. SettingsScene

- [x] relay / mute / developer mode の宣言的な scene interface を作る
- [x] in-memory AccountSettings / MuteList / DeviceSettings adapter を隠す
- [x] Story 上の add / toggle / remove / reset / save を外部接続なしで動かす
- [x] DeviceSettingsProvider に production / in-memory adapter の seam を作る
- [x] scene の状態と操作契約を Vitest で固定する

## 4. Storybook

- [x] Relay の signed-out / loading / missing / ready / saving / error
- [x] Mute の ready / private unavailable / loading / error
- [x] Lab の developer mode OFF / ON
- [x] MuteList が無いナビ状態
- [x] TextField / SegmentedControl の主要状態
- [x] Light / Dark と 880 x 640 canvas でPenpotを比較する

## 5. 検証と引き渡し

- [x] 新規テストが捕まえる変異を実際に入れ、赤を確認して戻す
- [x] `pnpm fix`
- [x] `pnpm verify:all`
- [x] ローカル Storybook で主要 Story を巡回する
- [x] コミット・push・PR作成
- [ ] 別コンテキストでPRをレビューし、指摘を反映する
