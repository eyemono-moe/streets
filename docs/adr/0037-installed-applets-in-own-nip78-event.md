---
status: accepted
---

# インストールしたアップレットは、デッキとは別の kind:30078 に保存する

インストールしたアップレット（NIP-5D の napplet）と、役割ごとの開く先の既定（NAP-INTENT の default handler）をアカウントに保存する。保存先は `kind:30078` の `d=moe.eyemono.streets/applets` にし、デッキ（[ADR-0033](./0033-deck-set-in-one-nip78-event.md)）と同じく NIP-44 で暗号化する。形は `{ version: 1, installed: [{ pubkey, identifier, relays?, installedAt }], defaults: { <archetype>: { type: "streets" } | { type: "applet", pubkey, identifier } } }`。

公開の標準の形は無い。NIP-51 にも NIP-5D にもアップレットの一覧の kind は無く、Grimoire は同じ理由で端末にだけ置いている。標準の形ができたら移す。

デッキの `d` タグに入れる形は取らなかった。古い版の Streets はデッキを保存し直すとき、知らない欄を落とす。

暗号化するのは、入れたアプリの一覧が、その人の使い方を露出するため。

## Consequences

- アップレットを入れる・外す・既定を変えるたびに、デッキと同じく遅らせてまとめて署名する。
- 別の端末で同時に変えると、デッキと同じ競合の確認が出る。
- 暗号化（NIP-44）を持たない署名器では、この端末にだけ保存する。
