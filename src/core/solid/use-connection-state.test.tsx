import { normalizeURL } from "nostr-tools/utils";
import { Subject } from "rxjs";
import { createRoot } from "solid-js";
import { describe, expect, test, vi } from "vitest";
import { createNostrCore } from "./provider";
import { useCoreConnectionState } from "./use-connection-state";

const createCore = () => {
  const connectionState$ = new Subject<{
    from: string;
    state: "connected" | "retrying";
  }>();
  const unsubscribe = vi.fn();
  const core = createNostrCore({
    rxNostr: {
      createConnectionStateObservable: vi.fn(() => ({
        subscribe(observer: {
          next(packet: { from: string; state: string }): void;
          error?(error: unknown): void;
          complete?(): void;
        }) {
          const subscription = connectionState$.subscribe(observer);
          return {
            unsubscribe() {
              unsubscribe();
              subscription.unsubscribe();
            },
          };
        },
      })),
      createAllMessageObservable: vi.fn(),
      setDefaultRelays: vi.fn(),
      use: vi.fn(),
      send: vi.fn(),
      dispose: vi.fn(),
    } as never,
  });

  return { core, connectionState$, unsubscribe };
};

describe("useCoreConnectionState", () => {
  test("normalizes relay urls, exposes the latest connection state, and cleans up with the core", async () => {
    const { core, connectionState$, unsubscribe } = createCore();

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const connectionState = useCoreConnectionState(core);

        queueMicrotask(async () => {
          connectionState$.next({
            from: "wss://Relay.Example/",
            state: "connected",
          });
          await vi.waitFor(() => {
            expect(
              connectionState()[normalizeURL("wss://Relay.Example/")],
            ).toBe("connected");
          });

          connectionState$.next({
            from: "wss://relay.example",
            state: "retrying",
          });
          await vi.waitFor(() => {
            expect(connectionState()[normalizeURL("wss://relay.example")]).toBe(
              "retrying",
            );
          });

          dispose();
          expect(unsubscribe).not.toHaveBeenCalled();
          core.dispose();
          expect(unsubscribe).toHaveBeenCalledOnce();
          resolve();
        });
      });
    });
  });

  test("uses the core-level snapshot for late-mounted consumers", async () => {
    const { core, connectionState$ } = createCore();

    connectionState$.next({
      from: "wss://relay.example",
      state: "connected",
    });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const connectionState = useCoreConnectionState(core);

        expect(connectionState()[normalizeURL("wss://relay.example")]).toBe(
          "connected",
        );
        dispose();
        core.dispose();
        resolve();
      });
    });
  });
});
