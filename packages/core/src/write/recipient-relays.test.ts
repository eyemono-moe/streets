import { describe, expect, it } from "vite-plus/test";
import type { RelayUrl } from "../relay/relay-connection";
import {
  MAX_RECIPIENT_RELAYS,
  RELAYS_PER_RECIPIENT,
  recipientRelays,
} from "./recipient-relays";

const pk = (n: number) => n.toString(16).padStart(64, "0");
const author = pk(1);
const alice = pk(2);
const bob = pk(3);

const lookup =
  (lists: Record<string, readonly string[]>) =>
  (pubkey: string): readonly RelayUrl[] =>
    (lists[pubkey] ?? []) as RelayUrl[];

const reply = (tags: string[][], kind = 1) => ({ kind, pubkey: author, tags });

describe("recipientRelays", () => {
  it("自分の write リレーと交わらない相手の read リレーを足す", () => {
    expect(
      recipientRelays(
        reply([["p", alice]]),
        lookup({ [alice]: ["wss://alice-inbox/"] }),
        ["wss://mine/"],
      ),
    ).toEqual(["wss://alice-inbox/"]);
  });

  it("自分の送信先や、ほかの相手と重なる URL は重ねて足さない", () => {
    expect(
      recipientRelays(
        reply([
          ["p", alice],
          ["p", bob],
          ["p", alice],
        ]),
        lookup({
          [alice]: ["wss://mine/", "wss://shared/"],
          [bob]: ["wss://shared/", "wss://bob/"],
        }),
        ["wss://mine/"],
      ),
    ).toEqual(["wss://shared/", "wss://bob/"]);
  });

  it("リレーリストが分からない相手は飛ばし、分かる相手の分だけ足す", () => {
    expect(
      recipientRelays(
        reply([
          ["p", alice],
          ["p", bob],
        ]),
        lookup({ [bob]: ["wss://bob/"] }),
        [],
      ),
    ).toEqual(["wss://bob/"]);
  });

  it("自分自身・壊れた p タグ・p 以外のタグは宛先にしない", () => {
    const relays = recipientRelays(
      reply([["p", author], ["p", "not-a-pubkey"], ["p"], ["e", alice]]),
      lookup({ [author]: ["wss://self/"], [alice]: ["wss://alice/"] }),
      [],
    );
    expect(relays).toEqual([]);
  });

  it("相手 1 人あたりの本数を抑える", () => {
    const many = ["wss://a/", "wss://b/", "wss://c/", "wss://d/"];
    expect(
      recipientRelays(reply([["p", alice]]), lookup({ [alice]: many }), []),
    ).toEqual(many.slice(0, RELAYS_PER_RECIPIENT));
  });

  it("宛先が多くても、足す本数の合計を抑える", () => {
    const recipients = Array.from({ length: 20 }, (_, i) => pk(100 + i));
    const lists = Object.fromEntries(
      recipients.map((p) => [
        p,
        [`wss://${p.slice(-4)}-1/`, `wss://${p.slice(-4)}-2/`],
      ]),
    );
    const relays = recipientRelays(
      reply(recipients.map((p) => ["p", p])),
      lookup(lists),
      [],
    );
    expect(relays).toHaveLength(MAX_RECIPIENT_RELAYS);
    // p タグの順に埋まる。
    expect(relays[0]).toBe(lists[recipients[0]][0]);
  });

  it.each([0, 3, 10000, 10002, 20001, 30000, 39999])(
    "kind:%i の p は宛先ではないので足さない",
    (kind) => {
      expect(
        recipientRelays(
          reply([["p", alice]], kind),
          lookup({ [alice]: ["wss://alice/"] }),
          [],
        ),
      ).toEqual([]);
    },
  );

  it.each([1, 5, 6, 7, 16, 42, 1111, 9735])(
    "kind:%i は相手へ届ける",
    (kind) => {
      expect(
        recipientRelays(
          reply([["p", alice]], kind),
          lookup({ [alice]: ["wss://alice/"] }),
          [],
        ),
      ).toEqual(["wss://alice/"]);
    },
  );
});
