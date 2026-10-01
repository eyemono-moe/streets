import {
  type NostrEvent,
  computeEventId,
  isNostrEvent,
  verifyEvent,
} from "../nostr/event";

/**
 * 覚えておく検証済みの組の上限。store に入ったイベントは保存済みの署名と
 * 比べられるので、ここが効くのは store を通らない経路と経路をまたぐ再配送
 * だけ。溢れたら古いものから忘れる（忘れても検証し直すだけで、誤りはしない）。
 */
const REMEMBERED_LIMIT = 20_000;
/** 無効な署名を無制限に送られても、覚える量を増やし続けない。 */
const REJECTED_LIMIT = 2_000;

export type VerifyStats = {
  /** schnorr 検証（id の再計算を含む）にかかった時間の累計。 */
  ms: number;
  /** schnorr 検証をした回数。偽物も費用を払うので数える。 */
  count: number;
  /** 1 回の検証にかかった時間の最大。 */
  maxMs: number;
  /** 検証済みと同じ id と署名だったので、schnorr 検証を省いた回数。 */
  skipped: number;
  /** 署名が無効だった回数。形式やイベント ID の不一致も含む。 */
  rejected: number;
  /** 同じ無効署名の再配送で、schnorr 検証を省いた回数。 */
  rejectedSkipped: number;
};

/**
 * リレーから届いたイベントを受け入れてよいかを決める関所。store に入る経路も、
 * 入らない経路（`subscribeUnstored`）もここを通す。
 */
export class SignatureGate {
  /** 検証を終えた id → 署名。確かめ終えたものだけを入れる —— 先に入れると、
   * 同じ id を名乗る偽物が先に届いたとき、本物まで落としてしまう。 */
  readonly #verified = new Map<string, string>();
  /** id と公開鍵の組 → 無効と確かめた署名。異なる署名は再検証する。 */
  readonly #rejected = new Map<string, string>();
  readonly #stats: VerifyStats = {
    ms: 0,
    count: 0,
    maxMs: 0,
    skipped: 0,
    rejected: 0,
    rejectedSkipped: 0,
  };

  get stats(): Readonly<VerifyStats> {
    return this.#stats;
  }

  /**
   * `knownSig` は呼び手が検証済みと知っている署名（store に保存済みの版）。
   * id は署名を含まないので、署名が一致しても id は必ず計算し直す。
   * BIP-340 の署名は同じ内容でも一意ではないので、署名が違えば検証する。
   */
  accept(event: NostrEvent, knownSig?: string): boolean {
    const rejectedKey = `${event.id}:${event.pubkey}`;
    if (
      event.sig === knownSig ||
      this.#verified.get(event.id) === event.sig ||
      this.#rejected.get(rejectedKey) === event.sig
    ) {
      const { id, sig: _sig, ...unsigned } = event;
      if (!isNostrEvent(event) || computeEventId(unsigned) !== id) {
        this.#stats.rejected += 1;
        return false;
      }
      if (this.#rejected.get(rejectedKey) === event.sig) {
        this.#stats.rejected += 1;
        this.#stats.rejectedSkipped += 1;
        return false;
      }
      this.#stats.skipped += 1;
      return true;
    }
    // 表示専用で分岐に影響しないため、`Scheduler` を通さず直に測る。
    const startedAt = performance.now();
    const verified = verifyEvent(event);
    const elapsed = performance.now() - startedAt;
    this.#stats.ms += elapsed;
    this.#stats.count += 1;
    this.#stats.maxMs = Math.max(this.#stats.maxMs, elapsed);
    if (verified) {
      this.#remember(event);
    } else {
      this.#stats.rejected += 1;
      // 形式や id が違う場合は覚えない。後から届く同じ id と署名の
      // 正しい内容まで拒否しないため、ここでも内容と id の結び付きを確かめる。
      const { id, sig: _sig, ...unsigned } = event;
      if (isNostrEvent(event) && computeEventId(unsigned) === id) {
        this.#rememberRejected(rejectedKey, event.sig);
      }
    }
    return verified;
  }

  #rememberRejected(key: string, sig: string): void {
    this.#rejected.delete(key);
    this.#rejected.set(key, sig);
    if (this.#rejected.size > REJECTED_LIMIT) {
      const oldest = this.#rejected.keys().next().value;
      if (oldest !== undefined) this.#rejected.delete(oldest);
    }
  }

  #remember(event: NostrEvent): void {
    this.#verified.delete(event.id);
    this.#verified.set(event.id, event.sig);
    if (this.#verified.size > REMEMBERED_LIMIT) {
      const oldest = this.#verified.keys().next().value;
      if (oldest !== undefined) this.#verified.delete(oldest);
    }
  }
}
