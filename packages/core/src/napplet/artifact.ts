/*
 * NIP-5D の Identity の手順のうち、本体を取って照合するところ。
 *
 * > 3. Fetch the artifact blob from Blossom by that sha256 and verify `sha256(blob)` equals the
 * >    `x` value. This is `artifactHash`.
 * > A gateway MAY serve the bytes as an accelerator or fallback, but the runtime MUST verify its
 * > output against the signed manifest — the gateway is never trusted.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export type NappletArtifactResult =
  | { ok: true; html: string; server: string }
  /** どのサーバーも答えなかった（無い・落ちている・断った）。 */
  | { ok: false; error: "unavailable" }
  /** 取れたが中身がマニフェストと違う。偽物か、書き換えられたもの。 */
  | { ok: false; error: "hash-mismatch" }
  | { ok: false; error: "no-server" };

type Fetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<Response>;

/** 1 枚の HTML としては大きすぎるもの。読み込みで端末を詰まらせない。 */
export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

/**
 * ハッシュで指した blob を、並べた順にサーバーへ聞いて取り、sha256 を照合して返す。
 * どれかが偽物を返しても、次のサーバーで正しいものが取れれば使う。
 */
export const fetchVerifiedBlob = async (
  hash: string,
  servers: readonly string[],
  fetch: Fetch,
  signal?: AbortSignal,
): Promise<
  | { ok: true; bytes: Uint8Array; server: string }
  | { ok: false; error: "unavailable" | "hash-mismatch" | "no-server" }
> => {
  if (servers.length === 0) return { ok: false, error: "no-server" };
  let mismatched = false;
  for (const server of servers) {
    signal?.throwIfAborted();
    let bytes: Uint8Array;
    try {
      const response = await fetch(`${server}/${hash}`, { signal });
      if (!response.ok) continue;
      const length = Number(response.headers.get("content-length"));
      if (length > MAX_ARTIFACT_BYTES) continue;
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (signal?.aborted) throw error;
      continue;
    }
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) continue;
    if (bytesToHex(sha256(bytes)) !== hash) {
      mismatched = true;
      continue;
    }
    return { ok: true, bytes, server };
  }
  return { ok: false, error: mismatched ? "hash-mismatch" : "unavailable" };
};

export const fetchNappletArtifact = async (
  hash: string,
  servers: readonly string[],
  fetch: Fetch,
  signal?: AbortSignal,
): Promise<NappletArtifactResult> => {
  const result = await fetchVerifiedBlob(hash, servers, fetch, signal);
  return result.ok
    ? {
        ok: true,
        html: new TextDecoder().decode(result.bytes),
        server: result.server,
      }
    : result;
};
