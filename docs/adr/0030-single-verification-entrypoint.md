---
status: accepted
---

# ローカルと CI の検証入口を `verify` に揃える

日常の検証は `pnpm verify`、Playwright を含む全検証は `pnpm verify:all` を入口とする。

`verify` は Biome と読み取り層の依存チェック、`tsc -b`、Vitest、Vite の本番ビルドを順に実行する。CI の Node 20 ジョブも同じ `verify` を呼ぶ。Playwright はフィクスチャが Node 22 のグローバル `WebSocket` を必要とするため、CI では Node 22 の独立した E2E ジョブに残す。`verify:all` はローカルでこの二つを一度に通す入口である。

## なぜ

検証項目を手で並べる運用では、型検査とテストが通ったあとに `check` だけを忘れる事故が起きた。CI とローカルが別々のコマンド列を持つ限り、片方だけに関門が増えるずれも再発する。検証内容を npm script に集約し、CI をその利用者にすることで、関門の定義を一箇所にする。

## `tsc --noEmit` の空振りを構造的には塞がない

ルートの `tsconfig.json` は project references の入口であり、`files: []` を持つ。したがって `pnpm exec tsc --noEmit` は参照先をビルドせず、何も検査しないまま成功する。正しい型検査は `tsc -b` である。

任意の CLI 呼び出しをリポジトリ側から禁止する安全な方法はない。`files: []` を外してルート自身にもファイルを拾わせると、各子プロジェクトの対象とコンパイラ設定を重複して持つことになり、project references を正としている構造を崩す。ラッパースクリプトで `tsc` バイナリを置き換える方法も、エディタや依存ツールまで巻き込む。

このため空振りするコマンド自体は残す。代わりに、サポートする検証入口を `verify` の一本にし、その内部では必ず `pnpm typecheck`、すなわち `tsc -b` を使う。CI も同じ入口を通すため、誤った手動コマンドだけで変更を完了扱いにしても共有ブランチでは通らない。

## Consequences

- 通常の完了条件は `pnpm verify` とする。
- ブラウザを含む変更の完了条件は、ローカルリレーを起動した前景実行の `pnpm verify:all` とする。
- 新しい静的検査やビルド関門は個別の CI コマンドとして追加せず、まず `verify` へ追加する。
- E2E の Node 要件が Node 20 と揃った場合は、CI も `verify:all` 一本へ統合できる。
