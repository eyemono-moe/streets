import { kinds } from "nostr-tools";
import { describe, expect, test } from "vitest";
import {
  createQueryParser,
  queryObjectToNostrFilter,
} from "./parseSearchQuery";

const mockUserBech32 =
  "npub1m0n0eyetgrflxghneeckkv95ukrn0fdpzyysscy4vha3gm64739qxn23sk";
const mockUserHex =
  "dbe6fc932b40d3f322f3ce716b30b4e58737a5a1110908609565fb146f55f44a";

describe("parseQuery", () => {
  // const store: StoreForParser = {};
  const parseQuery = createQueryParser();

  test("can parse query without filter", async () => {
    const query = "lorem       ipsum";
    const queryObject = await parseQuery(query);
    expect(queryObject.word).toBe("lorem ipsum");
  });
  test("can parse query with date-filter", async () => {
    const query = "lorem ipsum after:2021-01-23";
    const queryObject = await parseQuery(query);
    expect(queryObject.word).toBe("lorem ipsum");
    expect(queryObject.since).toEqual(
      new Date("2021-01-23T00:00:00.000").getTime(),
    );
  });
  test("can parse query with user-filter with bech32", async () => {
    const query = `lorem ipsum from:${mockUserBech32}`;
    const queryObject = await parseQuery(query);
    expect(queryObject.word).toBe("lorem ipsum");
    expect(queryObject.from).toEqual(mockUserHex);
  });
  test("can parse query with hashtag", async () => {
    const query = "lorem ipsum #hashtag";
    const queryObject = await parseQuery(query);
    expect(queryObject.word).toBe("lorem ipsum");
    expect(queryObject.hashtag).toEqual("hashtag");
  });
  test("can parse query with an invalid prefix", async () => {
    const query = "invalid:";
    const queryObject = await parseQuery(query);
    expect(queryObject.word).toBe("invalid:");
  });
  test("can parse query with empty prefixes", async () => {
    const query = "after: from: #";
    const queryObject = await parseQuery(query);
    expect(queryObject.since).toBeUndefined();
    expect(queryObject.from).toBeUndefined();
    expect(queryObject.hashtag).toBeUndefined();
  });
});

describe("toSearchMessageParam", () => {
  test("can convert query object to nostr filter", () => {
    const query = {
      word: "lorem ipsum",
      since: new Date("2021-01-23T00:00:00.000").getTime(),
      until: new Date("2021-01-23T00:00:00.000").getTime(),
      to: mockUserHex,
      from: mockUserHex,
      hashtag: "hashtag",
    };
    const params = queryObjectToNostrFilter(query);
    expect(params).toEqual({
      kinds: [kinds.ShortTextNote],
      search: "lorem ipsum",
      since: Math.floor(new Date("2021-01-23T00:00:00.000").getTime() / 1000),
      until: Math.floor(new Date("2021-01-23T00:00:00.000").getTime() / 1000),
      authors: [mockUserHex],
      "#t": ["hashtag"],
      "#p": [mockUserHex],
    });
  });
});
