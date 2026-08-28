import { type Page, expect, test } from "@playwright/test";
import type { Event, EventTemplate, Filter } from "nostr-tools";
import { Relay } from "nostr-tools";
import {
  eventActionTargetAuthorPubkey,
  eventActionTargetText,
  eventActionViewerPubkey,
  signAsEventActionTargetAuthor,
  signAsEventActionViewer,
} from "./fixtures/event-actions.js";
import { previewRelayUrl } from "./fixtures/seed-preview.js";

const stubSigner = async (page: Page) => {
  await page.exposeFunction(
    "__streetsSignEventAction",
    (template: EventTemplate) => signAsEventActionViewer(template),
  );
  await page.addInitScript((viewerPubkey: string) => {
    const win = window as typeof window & {
      nostr: unknown;
      __streetsSignEventAction(template: unknown): Promise<unknown>;
    };
    win.nostr = {
      getPublicKey: async () => viewerPubkey,
      signEvent: (template: unknown) => win.__streetsSignEventAction(template),
    };
  }, eventActionViewerPubkey);
};

const seedActionDeck = async (page: Page) => {
  await page.addInitScript(
    ({ viewer, author, relay }) => {
      window.localStorage.setItem(
        `streets.v1.deck.${viewer}`,
        JSON.stringify({
          version: 2,
          columns: [
            {
              id: "actions",
              title: "actions",
              source: {
                kind: "literal",
                filters: [{ kinds: [1], authors: [author] }],
                relays: [relay],
              },
            },
          ],
        }),
      );
    },
    {
      viewer: eventActionViewerPubkey,
      author: eventActionTargetAuthorPubkey,
      relay: previewRelayUrl,
    },
  );
};

const fetchEvents = async (filter: Filter): Promise<Event[]> => {
  const relay = await Relay.connect(previewRelayUrl);
  try {
    const events: Event[] = [];
    await new Promise<void>((resolve) => {
      const subscription = relay.subscribe([filter], {
        onevent: (event) => events.push(event),
        oneose: () => {
          subscription.close();
          resolve();
        },
      });
    });
    return events;
  } finally {
    relay.close();
  }
};

test("返信・リポスト・Likeを同じWriter経路で送信する", async ({ page }) => {
  test.setTimeout(90_000);
  await stubSigner(page);
  await seedActionDeck(page);

  const targetText = `${eventActionTargetText} ${Date.now()}`;
  const target = signAsEventActionTargetAuthor({
    kind: 1,
    created_at: Math.floor(Date.now() / 1_000),
    tags: [],
    content: targetText,
  });
  const relay = await Relay.connect(previewRelayUrl);
  try {
    await relay.publish(target);
  } finally {
    relay.close();
  }

  const since = Math.floor(Date.now() / 1_000) - 1;
  const replyText = `event action reply ${Date.now()}`;
  await page.goto(`/v1?relays=${encodeURIComponent(previewRelayUrl)}`);
  await page.getByTestId("login").click();
  await expect(page.getByTestId("viewer-pubkey")).toHaveText(
    eventActionViewerPubkey,
    { timeout: 15_000 },
  );

  const item = page.getByTestId("item").filter({ hasText: targetText }).first();
  await expect(item).toBeVisible({ timeout: 20_000 });
  await item.getByTestId("note-content").click();

  const focus = page.getByTestId("thread-focus");
  await expect(focus).toContainText(targetText);
  await focus.getByTestId("event-like").click();
  await expect(focus.getByTestId("event-like")).toBeDisabled();
  await focus.getByTestId("event-repost").click();
  await expect(focus.getByTestId("event-repost")).toBeDisabled();

  await focus.getByTestId("event-reply").click();
  await page.getByTestId("reply-input").fill(replyText);
  await page.getByTestId("reply-submit").click();
  await expect(page.getByTestId("reply-dialog")).toHaveCount(0, {
    timeout: 15_000,
  });
  // ProjectedWriter が threadSection のリレーエコーを待たず同じ背骨へ重ねる。
  await expect(page.getByTestId("thread")).toContainText(replyText, {
    timeout: 5_000,
  });

  // 見た目だけでなく、3 kind が実リレーへ届いたことを確認する。
  await expect
    .poll(
      async () => {
        const events = await fetchEvents({
          kinds: [1, 6, 7],
          authors: [eventActionViewerPubkey],
          "#e": [target.id],
          since,
        });
        return {
          reply: events.some(
            (event) => event.kind === 1 && event.content === replyText,
          ),
          repost: events.some((event) => event.kind === 6),
          like: events.some(
            (event) => event.kind === 7 && event.content === "+",
          ),
        };
      },
      { timeout: 20_000 },
    )
    .toEqual({ reply: true, repost: true, like: true });
});
