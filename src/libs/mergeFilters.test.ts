import type { Filter } from "nostr-tools";
import { expect, test } from "vitest";
import { mergeSimilarAndRemoveEmptyFilters } from "./mergeFilters";

test("Merge filters automatically", () => {
  const filters: Filter[] = [
    { authors: ["pub1"], kinds: [0, 2] },
    { ids: ["1"] },
    { "#p": ["p1", "p2"] },
    { authors: ["pub2"], kinds: [0, 2] },
    { ids: ["5"] },
    { "#p": ["p2", "p3"] },
    { kinds: [6, 7], "#e": ["e1"] },
    { kinds: [6, 7], "#e": ["e2"] },
    { kinds: [6], "#e": ["e3"] },
    { kinds: [7], "#e": ["e3"] },
  ];

  const result = mergeSimilarAndRemoveEmptyFilters(filters);
  expect(result).toEqual([
    { authors: ["pub1", "pub2"], kinds: [0, 2] },
    { ids: ["1", "5"] },
    { "#p": ["p1", "p2", "p3"] },
    { kinds: [6, 7], "#e": ["e1", "e2"] },
    { kinds: [6], "#e": ["e3"] },
    { kinds: [7], "#e": ["e3"] },
  ]);
});

test("Don't merge filters using different relays and different ids", () => {
  const filters: (Filter & { relay?: string })[] = [
    { ids: ["1"] },
    { ids: ["2"], relay: "wss://nostr-dev.wellorder.net/" },
  ];

  const result = mergeSimilarAndRemoveEmptyFilters(filters);
  expect(result).toEqual(filters);
});

test("Remove empty filters", () => {
  const filters: (Filter & { relay?: string })[] = [
    { ids: [] },
    { authors: [], relay: "wss://nostr-dev.wellorder.net/" },
  ];

  const result = mergeSimilarAndRemoveEmptyFilters(filters);
  expect(result).toEqual([]);
});

test("concat error", () => {
  const filters: (Filter & { relay?: string })[] = [
    {
      kinds: [0],
      authors: [
        "d947f9664226bd61d2791e57b9eda7ed6a863558f0ca5b633a57d665abf1c11f",
      ],
    },
    {
      kinds: [6],
      "#e": [
        "d6b3b4804b3eb963236a3bd6f0bccb49fbaa216744ae76d50977d757472f0b7d",
      ],
    },
    {
      kinds: [7],
      "#e": [
        "d6b3b4804b3eb963236a3bd6f0bccb49fbaa216744ae76d50977d757472f0b7d",
      ],
    },
    {
      kinds: [6],
      "#e": [
        "fac35a0bc206f19a3cdf121669bcdea43623d7093e0c61fe1fc2028a973e4580",
      ],
    },
    {
      kinds: [7],
      "#e": [
        "fac35a0bc206f19a3cdf121669bcdea43623d7093e0c61fe1fc2028a973e4580",
      ],
    },
    {
      kinds: [6],
      "#e": [
        "28f70be1bc3325bd87ebbeb43c9eea082b7a144b68e1cb32e85d5874f48e5956",
      ],
    },
    {
      kinds: [7],
      "#e": [
        "28f70be1bc3325bd87ebbeb43c9eea082b7a144b68e1cb32e85d5874f48e5956",
      ],
    },
  ];
  const _result = mergeSimilarAndRemoveEmptyFilters(filters);
  console.log(_result);
  expect(_result.length).toBe(3);
});

test("benchmark_merge", () => {
  const filters: Filter[] = [];
  for (let i = 0; i < 3000; i++) {
    filters.push({ authors: [i.toString()], kinds: [0, 2] });
    filters.push({ ids: [i.toString()] });
    filters.push({ "#p": [i.toString(), (i + 1).toString()] });
  }
  const start = Date.now();
  const _result = mergeSimilarAndRemoveEmptyFilters(filters);
  const time = Date.now() - start;
  // console.log("mergeSimilarAndRemoveEmptyFilters benchmark", time);
  expect(time).toBeLessThan(100);
  expect(_result.length).toBe(3);
});

test("merge3", () => {
  const filters: Filter[] = [
    { authors: ["pub1"], kinds: [0] },
    { authors: ["pub2"], kinds: [0] },
    { authors: ["pub3"], kinds: [0] },
  ];
  const result = mergeSimilarAndRemoveEmptyFilters(filters);
  expect(result.length).toBe(1);
  expect(JSON.stringify(result)).toBe(
    JSON.stringify([{ authors: ["pub1", "pub2", "pub3"], kinds: [0] }]),
  );
});
