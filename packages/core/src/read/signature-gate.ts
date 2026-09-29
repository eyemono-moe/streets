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

export type VerifyStats = {
  /** schnorr 検証（id の再計算を含む）にかかった時間の累計。 */
  ms: number;
  /** schnorr 検証をした回数。偽物も費用を払うので数える。 */
  count: number;
  /** 1 回の検証にかかった時間の最大。 */
  maxMs: number;
  /** 検証済みと同じ id と署名だったので、schnorr 検証を省いた回数。 */
  skipped: number;
};

/**
 * リレーから届いたイベントを受け入れてよいかを決める関所。store に入る経路も、
 * 入らない経路（`subscribeUnstored`）もここを通す。
 */
export class SignatureGate {
  /** 検証を終えた id → 署名。確かめ終えたものだけを入れる —— 先に入れると、
   * 同じ id を名乗る偽物が先に届いたとき、本物まで落としてしまう。 */
  readonly #verified = new Map<string, string>();
  readonly #stats: VerifyStats = { ms: 0, count: 0, maxMs: 0, skipped: 0 };

  get stats(): Readonly<VerifyStats> {
    return this.#stats;
  }

  /**
   * `knownSig` は呼び手が検証済みと知っている署名（store に保存済みの版）。
   * id は署名を含まないので、署名が一致しても id は必ず計算し直す。
   * BIP-340 の署名は同じ内容でも一意ではないので、署名が違えば検証する。
   */
  accept(event: NostrEvent, knownSig?: string): boolean {
    if (event.sig === knownSig || this.#verified.get(event.id) === event.sig) {
      const { id, sig: _sig, ...unsigned } = event;
      if (!isNostrEvent(event) || computeEventId(unsigned) !== id) return false;
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
    if (verified) this.#remember(event);
    return verified;
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
