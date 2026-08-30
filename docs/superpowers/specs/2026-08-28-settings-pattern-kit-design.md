# Settings Pattern Kit と設定画面の分割 — 設計案

## 0. このスライスは何のためにあるか

v1 の設定画面は、リレー、ミュート、開発者モードを実際に変更できるところまで
動いている。一方で、表示、フォーム状態、Nostr への保存処理の呼び出しが
597 行の `SettingsDialog.tsx` に集まり、Penpot と見比べて一箇所を直すたびに
画面全体を読み直す必要がある。

このスライスでは、Penpot の Settings ボードを実装可能な表示パターンへ落とし、
設定の各状態を Storybook でリレー・署名器なしに再現できるようにする。
プロダクトの設定値を一つの props object へ詰め直すのではなく、既存の
`AccountSettings`、`MuteList`、`DeviceSettings` context を各ページが直接読む。

## 1. 一次情報の優先順位

設定画面について情報が食い違う場合は、次の順で判断する。

1. Penpot の streets ファイル、`v1 / redesign` ページの `Settings` ボード
2. ADR と v1 の動作契約
3. 現在動いている v1 の設定 context と E2E
4. v0 の設定画面

Issue #208 のコメントには「v0 を見た目の一次情報とする」とあるが、その後の
プロジェクト方針により Penpot が一次情報になった。v0 は Penpot にまだ無い
設定項目の参考に限り、Penpot と競合するレイアウトを持ち込まない。

2026-08-28 時点の Penpot は、880 x 640 のカードを 220px の左ナビと 660px の
本文に分けている。リレー画面の本文余白は左右 24px、内容幅は 612px。
この寸法と面の階層を保つ。

## 2. 外部 interface は増やさない

`SettingsDialog` の外部 interface は現在と同じままにする。

```ts
type SettingsDialogProps = {
  onClose(): void;
};
```

リレー一覧、保存状態、ミュート項目、開発者モードを props に追加しない。
`SettingsDialog` は利用可能なページを組み立て、各ページは対応する context を読む。

- `RelaySettingsPage` は `useAccountSettings()`
- `MuteSettingsPage` は `useOptionalMuteList()` で存在するときだけ組み込む
- `LabSettingsPage` は `useDeviceSettings()`

これにより、設定項目が増えてもデッキ側の呼び出し interface は変わらない。

## 3. module の分割

```text
src/routes/v1/
  SettingsDialog.tsx
  settings/
    SettingsShell.tsx
    SettingsPage.tsx
    SettingsTextField.tsx
    SettingsSegmentedControl.tsx
    RelaySettingsPage.tsx
    MuteSettingsPage.tsx
    LabSettingsPage.tsx
```

### SettingsDialog

外部から呼ばれる深い module。`onClose` だけを受け、利用可能なページと context
配線を内側へ隠す。既存 import を壊さないためファイル位置は変えない。

### SettingsShell

Ark UI の `Dialog`、`Tabs`、`Portal` と、Penpot の 220px / 660px レイアウトを
隠す表示 module。interface は `onClose`、初期ページ、表示するページの定義だけ。
ページ定義は `value`、`label`、`content` の表示情報であり、設定値や保存 handler は
含めない。

Backdrop、外側クリック、Escape、フォーカス復帰、CloseTrigger はここで一度だけ
実装する。E2E が使う `settings-dialog`、`settings-backdrop`、`settings-close`、
`settings-tab-*` は維持する。

### SettingsPage

見出し、説明と本文の縦方向リズムを揃える。3 ページが共有する表示規則だけを持ち、
設定状態の分岐や Dialog の close 処理は持たない。

### SettingsTextField / SettingsSegmentedControl

リレーとミュートの双方で使う入力欄と選択肢を、Ark UI の Field / ToggleGroup と
Penpot の見た目へ揃える。label、disabled、invalid、選択値と変更通知を隠すが、
リレー URL やミュート種別というドメイン語は知らない。

ボタン、notice、list row はこの時点では抽象化しない。既存 `Button` を再利用し、
異なる三つの row を共通の props へ押し込めない。二つ目の実例で同じ規則が確認
できてから抽出する。

## 4. ナビゲーション

本番の左ナビには、現在操作可能な項目だけを出す。

- リレー
- ミュート（`MuteList` が提供される場合）
- ラボ

Penpot に描かれているアカウント、表示、通知は情報設計上の予定地であり、この
スライスでは押せない項目や空ページとして出さない。機能を実装するスライスで
ページと同時に追加する。

Penpot にまだ無いミュートは、既に動作する P1 機能なので本番ナビから外さない。
この差分は Penpot 側を更新すべき対象として残すが、このスライスから Penpot を
書き換えない。

## 5. SettingsScene

Storybook の Story に `AccountSettings` や `MuteList` の全メソッドを書かせない。
`src/storybook/SettingsScene.tsx` に、表示したい初期状態だけを宣言する interface を
置く。

```ts
type SettingsScene = {
  relays: RelaySettingsScene;
  mutes?: MuteSettingsScene;
  developerMode?: boolean;
};
```

`SettingsSceneProvider` は次を作る。

- scene から動く in-memory `AccountSettings`
- 指定された場合だけ in-memory `MuteList`
- in-memory `DeviceSettings`
- 上記三つの Provider

add / remove / toggle / reset は Storybook 上でも state を更新し、保存は外部へ接続
せず Story 内で完了する。Nostr event、Writer、署名器、localStorage は Story の
interface に出さない。

`DeviceSettingsProvider` は現在 production storage を内部生成しているため、
`value?: DeviceSettings` を受けられるようにする。値を省略した本番では従来どおり
localStorage adapter、Storybook では in-memory adapter を使う。二つの adapter が
実在する seam だけを公開し、Storybook 専用分岐を本番 module に入れない。

## 6. 最初の Story

### 設定画面全体

- リレー: ready
- リレー: signed-out
- リレー: loading
- リレー: missing
- リレー: saving
- リレー: error
- ミュート: ready（公開・非公開を含む）
- ミュート: privatePart unavailable
- ミュート: loading / error
- ラボ: 開発者モード OFF / ON
- MuteList が無く、ミュートのナビ自体が無い状態

Light / Dark は既存 Storybook toolbar で切り替える。設定カードは Penpot と同じ
880 x 640 を基準にし、狭い viewport では既存どおり上下左右 24px を残して縮む。

個別の表示 pattern の Story は、状態差が単体で判断できる
`SettingsTextField` と `SettingsSegmentedControl` にだけ作る。単なる wrapper を
Story 数で水増ししない。

## 7. Penpot と実装を往復する手順

1. Penpot の board / component / token を MCP で読む
2. 対応する Story を作り、実データなしで状態差を確認する
3. `pnpm storybook` をユーザーのローカルで開き、チャットで見た目を確認する
4. 承認された pattern を本番ページへ適用する
5. 実装で判明した制約が Penpot と競合した場合、どちらを直すかを記録する

Storybook を「実装後の展示場所」ではなく、Penpot と本番コードの間で先に触れる
確認面として使う。ローカルリレーへの seed は Nostr の保存経路を確認するときだけ
使う。

## 8. 既存動作とテスト

次の動作は変更しない。

- NIP-65 リレーリストの追加、read / write 切替、削除、reset、保存
- ミュートの追加、公開範囲変更、削除、NIP-44 非対応時の劣化表示
- 開発者モードの即時反映と localStorage 永続化
- Dialog 内側クリックでは閉じず、外側クリックと Escape で閉じる
- Escape で設定起点へフォーカスを戻す
- 既存 E2E の `data-testid`

pure な scene adapter と pattern の interface は Vitest で検証する。実リレーへの
保存と再購読は既存 Playwright を維持する。Story ごとのスクリーンショット CI は
導入しない。

## 9. このスライスで完了とするもの

- `SettingsDialog.tsx` の外部 interface を保った分割
- Penpot の Settings shell とリレー画面への見た目の整合
- 設定状態を外部接続なしで再現する Storybook stories
- 開発者モードを Lab に置く既存動作を回帰テストで固定
- Issue #208 を、設定画面と開発者モードの正式な置き場所ができたものとして閉じる

## 10. 範囲外

- アカウント切替、プロフィール編集
- 表示設定、通知設定
- 新しい設定項目の protocol / storage 実装
- Penpot ファイル自体の編集
- 全画面共通の Button / Field / row デザインシステム
- Storybook の公開、画像差分 CI
- モバイル設定画面
