import { describe, expect, it, vi } from "vite-plus/test";
import type { RelayUrl } from "./relay-connection";
import { createRelayFailures } from "./relay-failures";

const A = "wss://a/" as RelayUrl;
const B = "wss://b/" as RelayUrl;

describe("createRelayFailures", () => {
  it("counts repeated failures of the same relay and keeps the latest reason", () => {
    let now = 1_000;
    const failures = createRelayFailures(() => now);
    failures.recorder.unreachable(A);
    now = 2_000;
    failures.recorder.refused(A, "restricted: not on the allowlist");

    expect(failures.list()).toEqual([
      {
        url: A,
        reason: "restricted",
        detail: "not on the allowlist",
        count: 2,
        lastAt: 2_000,
      },
    ]);
  });

  it("lists the most recent failure first", () => {
    let now = 1_000;
    const failures = createRelayFailures(() => now);
    failures.recorder.unreachable(A);
    now = 2_000;
    failures.recorder.unreachable(B);

    expect(failures.list().map((failure) => failure.url)).toEqual([B, A]);
  });

  // NIP-01: "The standardized machine-readable prefixes for `OK` and `CLOSED` are: `duplicate`,
  // `pow`, `blocked`, `rate-limited`, `invalid`, `restricted`, `mute` and `error`"
  // NIP-42: "`"auth-required: "` - for when a client has not performed `AUTH` and the relay
  // requires that to fulfill the query or write the event."
  it("records refusals that mean the relay cannot be used", () => {
    const failures = createRelayFailures(() => 0);
    failures.recorder.refused(
      A,
      "auth-required: we can't serve DMs to unauthenticated users",
    );
    failures.recorder.refused(B, "blocked: you are banned");

    expect(
      failures
        .list()
        .map(({ url, reason, detail }) => ({ url, reason, detail })),
    ).toEqual([
      {
        url: A,
        reason: "auth-required",
        detail: "we can't serve DMs to unauthenticated users",
      },
      { url: B, reason: "restricted", detail: "you are banned" },
    ]);
  });

  it("ignores refusals about what was sent rather than the relay itself", () => {
    const failures = createRelayFailures(() => 0);
    for (const message of [
      "rate-limited: slow down",
      "invalid: bad signature",
      "duplicate: already have it",
      "pow: difficulty 20 required",
      "error: could not save",
      "closed",
    ]) {
      failures.recorder.refused(A, message);
    }

    expect(failures.list()).toEqual([]);
  });

  it("forgets an unreachable relay once it opens, but keeps a refusing one", () => {
    const failures = createRelayFailures(() => 0);
    failures.recorder.unreachable(A);
    failures.recorder.refused(B, "auth-required:");
    failures.recorder.opened(A);
    failures.recorder.opened(B);

    expect(failures.list().map((failure) => failure.url)).toEqual([B]);
  });

  it("notifies listeners only when the list changes", () => {
    const failures = createRelayFailures(() => 0);
    const listener = vi.fn();
    const off = failures.subscribe(listener);
    failures.recorder.opened(A);
    failures.recorder.refused(A, "rate-limited:");
    expect(listener).not.toHaveBeenCalled();

    failures.recorder.unreachable(A);
    failures.recorder.opened(A);
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    failures.recorder.unreachable(A);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
