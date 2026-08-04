import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { warmUpRouting } from "../core/read/bootstrap";
import { EventStore } from "../core/read/event-store";
import { RoutingTable } from "../core/read/routing-table";
import type { NostrSource, SectionStatus } from "../core/read/source";
import { SubscriptionManager } from "../core/read/subscription-manager";
import { connectRelay } from "../core/relay/websocket-relay-connection";
import { createNip07Signer } from "../core/signer/nip07-signer";
import { SignerUnavailableError } from "../core/signer/signer";
import { createSection } from "../core/solid/create-section";
import Button from "../shared/components/UI/Button";
import Note from "./v1-preview/Note";
import { parseRelays } from "./v1-preview/parse-relays";

/**
 * `?relays=` でローカルリレーへ上書きする (parse-relays.ts 参照)。
 * **既定は本物のリレー。** このクエリパラメータは e2e 専用の抜け道であり、
 * 通常このアプリがリレーをクエリ文字列から取ることはない —
 * debug ルートの `?budget=` と同じ立て付け。
 */
const RELAYS_OVERRIDE = parseRelays(
  new URLSearchParams(window.location.search).get("relays"),
);

/**
 * v1 の垂直スライス最初の一歩。「自分の pubkey が画面に出る」ところまで。
 *
 * **拡張機能の有無をマウント時に一度だけ確認して結果を保持する、という
 * ことはしない。** NIP-07 拡張は content script としてページ本体より
 * *後に* window.nostr を注入することがあり (nip07-signer.ts のコメント
 * 参照)、確認結果をシグナルに固定すると「後から入った拡張」を永久に
 * 見失う — signer-error が「拡張機能が見つかりません」を出したまま、
 * 実際には拡張が入っていても永久に更新されない、という壊れ方をする。
 * ログインボタンは常に表示し、クリックのたびに
 * createNip07Signer().getPublicKey() を呼んで、そのとき初めて拡張の
 * 有無を確かめる (SignerUnavailableError なら「見つからない」)。
 * nip07-signer.ts が「呼び出しのたびに読み直す」という同じ原則を、
 * ここでも UI 側で踏襲している。
 */
const V1Preview: Component = () => {
  const [pubkey, setPubkey] = createSignal<string>();
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);

  // 読み取り層の配線。debug/v1-section.tsx と同じ構成
  // (EventStore → RoutingTable → SubscriptionManager → warmUpRouting →
  // createSection)。違いは 2 点だけ: ① 本物のリレーを使う (RELAYS_OVERRIDE
  // が無い限り、各層それぞれの既定 = BOOTSTRAP_INDEXERS / FALLBACK_RELAYS が
  // そのまま効く)。② pubkey はクエリパラメータではなくログインから来る。
  const store = new EventStore();
  const routing = new RoutingTable(store);
  const manager = new SubscriptionManager({
    store,
    routing,
    connect: connectRelay,
    // undefined なら SubscriptionManager 自身の既定 (FALLBACK_RELAYS) が効く
    fallbackRelays: RELAYS_OVERRIDE,
  });

  // pubkey が undefined の間 (ログイン前) は createResource がフェッチャーを
  // 呼ばない — デバッグルートのような「空文字を弾く」ガードが要らない
  // (source が nullish なら Solid 自身が起動を見送るため)。
  const [warmUp] = createResource(pubkey, (pk) =>
    warmUpRouting({
      pubkey: pk,
      store,
      // マネージャと同じ ConnectionPool を使う (ADR-0011 の予算を一本化する)
      pool: manager.pool,
      // undefined なら warmUpRouting 自身の既定 (BOOTSTRAP_INDEXERS) が効く
      indexers: RELAYS_OVERRIDE,
    }),
  );

  const source = createMemo<NostrSource>(() => {
    const followees = warmUp()?.followees ?? [];
    return {
      type: "nostr",
      // ルーティング表に任せる。relays は指定しない (Outbox)
      filters: followees.length > 0 ? [{ kinds: [1], authors: followees }] : [],
    };
  });

  const section = createSection({ source, store, manager });

  // warmUp がまだフォロー数を確定させていない間は source が filters: [] を
  // 返し、0 リレー分の購読は購読対象が無いぶん瞬時に vacuously 「settled」
  // になってしまう (debug/v1-section.tsx と同じ理由)。表示上はウォーム
  // アップが終わるまで initial に留めておく。
  const status = createMemo<SectionStatus>(() =>
    warmUp.loading ? { phase: "initial" } : section.status(),
  );

  const login = async () => {
    setLoading(true);
    setErrorMessage(undefined);
    try {
      const signer = createNip07Signer();
      setPubkey(await signer.getPublicKey());
    } catch (error) {
      setErrorMessage(
        error instanceof SignerUnavailableError
          ? // TODO: NIP-46 (bunker) の導線 (ADR-0008 の Consequences) は後続タスク
            "拡張機能が見つかりません。NIP-07 対応の拡張機能 (nos2x, Alby 等) を導入してから、もう一度ログインボタンを押してください。"
          : `ログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="mx-auto max-w-md space-y-4 p-6">
      <h1 class="font-bold text-lg">v1 プレビュー</h1>

      <Show
        when={!pubkey()}
        fallback={
          <p
            data-testid="viewer-pubkey"
            class="break-all rounded-2 border border-alpha-300 bg-alpha-50 p-3 text-sm"
          >
            {pubkey()}
          </p>
        }
      >
        <Button data-testid="login" disabled={loading()} onClick={login}>
          {loading() ? "確認中…" : "NIP-07 でログイン"}
        </Button>

        <Show when={errorMessage()}>
          {(message) => (
            <p
              data-testid="signer-error"
              class="rounded-2 border border-red-6 bg-red-4/10 p-3 text-red-8 text-sm dark:text-red-4"
            >
              {message()}
            </p>
          )}
        </Show>
      </Show>

      <Show when={pubkey()}>
        <section data-testid="home-column" class="space-y-2">
          <h2 class="font-bold">ホーム</h2>

          {/* followees はフォロー 0 人・ウォームアップ失敗・ルーティング失敗・
              接続予算切れを見分けるための最小限の手掛かり (仕様 10 節 問い 4)。
              incomplete は生の数値のまま出す (仕様 7 節) — ユーザー向けの
              翻訳はまだしない。 */}
          <p data-testid="warmup" class="text-alpha-600 text-xs">
            followees: {warmUp()?.followees.length ?? 0}
          </p>
          <p data-testid="phase" class="text-alpha-600 text-xs">
            phase: {status().phase}
          </p>
          <p data-testid="unreachable" class="text-alpha-600 text-xs">
            unreachableRelays: {status().incomplete?.unreachableRelays ?? 0}
          </p>
          <p data-testid="unroutable" class="text-alpha-600 text-xs">
            unroutableAuthors: {status().incomplete?.unroutableAuthors ?? 0}
          </p>
          <p data-testid="uncovered" class="text-alpha-600 text-xs">
            uncoveredAuthors: {status().incomplete?.uncoveredAuthors ?? 0}
          </p>

          <ul data-testid="items" class="space-y-2">
            <For each={section.items()}>
              {(event) => (
                <li data-testid="item">
                  <Note event={event} />
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
};

export default V1Preview;
