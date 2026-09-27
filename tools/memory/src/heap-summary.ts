/**
 * Chrome のヒープスナップショット（`.heapsnapshot`）を、何がどれだけ取っているかの
 * 表にまとめる。数百 MB になるので、全体を `JSON.parse` せず、数値の配列と文字列の
 * 配列だけを読む（V8 の文字列の長さ上限を超えることがある）。
 */

export type HeapGroup = {
  type: string;
  name: string;
  count: number;
  size: number;
};

export type HeapSummary = {
  totalSize: number;
  nodeCount: number;
  /** V8 のノードの種類（object・string・native など）ごとの合計。 */
  byType: HeapGroup[];
  /** 種類と名前（コンストラクタ名など）ごとの合計を、大きい順に。 */
  top: HeapGroup[];
  /** `id`・`pubkey`・`sig` をプロパティに持つオブジェクト。Nostr のイベントの数の目安。 */
  nostrEvents: number;
  /** ページから外れたのに残っている DOM のノード。 */
  detachedNodes: number;
};

type Meta = {
  node_fields: string[];
  node_types: [string[], ...unknown[]];
  edge_fields: string[];
  edge_types: [string[], ...unknown[]];
};

type Header = {
  snapshot: { meta: Meta; node_count: number; edge_count: number };
};

/** 名前で分けても意味の無い種類。文字列の中身ごとに分かれてしまう。 */
const TYPES_WITHOUT_NAME = new Set([
  "string",
  "concatenated string",
  "sliced string",
  "number",
  "bigint",
  "code",
  "regexp",
  "symbol",
]);

const EVENT_PROPERTIES = ["id", "pubkey", "sig"];

const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const ZERO = 0x30;
const NINE = 0x39;

const arrayStart = (buffer: Buffer, key: string, from: number): number => {
  const at = buffer.indexOf(`"${key}":`, from);
  if (at < 0) throw new Error(`ヒープスナップショットに ${key} がありません`);
  const bracket = buffer.indexOf(OPEN_BRACKET, at);
  return bracket + 1;
};

/** 数値の配列を `length` 個読む。返すのは読み終えた位置。 */
const readInts = (
  buffer: Buffer,
  start: number,
  length: number,
): { values: Float64Array; end: number } => {
  const values = new Float64Array(length);
  let position = start;
  for (let i = 0; i < length; i++) {
    while (buffer[position] < ZERO || buffer[position] > NINE) position++;
    let value = 0;
    while (buffer[position] >= ZERO && buffer[position] <= NINE) {
      value = value * 10 + (buffer[position] - ZERO);
      position++;
    }
    values[i] = value;
  }
  return { values, end: position };
};

/**
 * 文字列の配列を先頭から読み、`pick` が求めた番号のものを取り出す。
 * `pick` は番号と、引用符を含むそのままのバイト列を受け取る。
 */
const readStrings = (
  buffer: Buffer,
  start: number,
  pick: (index: number, raw: Buffer) => boolean,
): Map<number, string> => {
  const strings = new Map<number, string>();
  let position = start;
  for (let index = 0; ; index++) {
    while (buffer[position] !== QUOTE && buffer[position] !== CLOSE_BRACKET) {
      position++;
    }
    if (buffer[position] === CLOSE_BRACKET) return strings;
    const from = position;
    position++;
    while (buffer[position] !== QUOTE) {
      position += buffer[position] === BACKSLASH ? 2 : 1;
    }
    position++;
    const raw = buffer.subarray(from, position);
    if (pick(index, raw)) strings.set(index, JSON.parse(raw.toString("utf8")));
  }
};

export const summarizeHeapSnapshot = (
  buffer: Buffer,
  topCount = 30,
): HeapSummary => {
  const nodesStart = arrayStart(buffer, "nodes", 0);
  const headerText = buffer
    .toString("utf8", 0, buffer.lastIndexOf('"nodes"', nodesStart))
    .replace(/,\s*$/, "}");
  const { snapshot } = JSON.parse(headerText) as Header;
  const { meta } = snapshot;

  const nodeFields = meta.node_fields.length;
  const edgeFields = meta.edge_fields.length;
  const nodeType = meta.node_fields.indexOf("type");
  const nodeName = meta.node_fields.indexOf("name");
  const nodeSize = meta.node_fields.indexOf("self_size");
  const nodeEdges = meta.node_fields.indexOf("edge_count");
  const nodeDetached = meta.node_fields.indexOf("detachedness");
  const edgeType = meta.edge_fields.indexOf("type");
  const edgeName = meta.edge_fields.indexOf("name_or_index");
  const nodeTypes = meta.node_types[0];
  const edgeTypes = meta.edge_types[0];
  const propertyEdge = edgeTypes.indexOf("property");

  const nodes = readInts(buffer, nodesStart, snapshot.node_count * nodeFields);
  const edges = readInts(
    buffer,
    arrayStart(buffer, "edges", nodes.end),
    snapshot.edge_count * edgeFields,
  ).values;

  // 名前の番号で先にまとめ、文字列は必要な分だけ後で引く。
  const groups = new Map<
    string,
    { type: number; name: number; count: number; size: number }
  >();
  const byType = new Map<number, { count: number; size: number }>();
  const wanted = new Set<number>();
  // 文字列の配列はファイルの末尾にある。イベントのプロパティ名の番号を先に引いておく。
  const stringsStart = arrayStart(
    buffer,
    "strings",
    buffer.lastIndexOf('"strings":'),
  );
  const eventNames = EVENT_PROPERTIES.map((name) =>
    Buffer.from(JSON.stringify(name)),
  );
  const eventNameIds = new Set(
    readStrings(buffer, stringsStart, (_, raw) =>
      eventNames.some((name) => name.equals(raw)),
    ).keys(),
  );
  let nostrEvents = 0;
  let totalSize = 0;
  let detachedNodes = 0;
  let edgeOffset = 0;

  for (let offset = 0; offset < nodes.values.length; offset += nodeFields) {
    const type = nodes.values[offset + nodeType];
    const size = nodes.values[offset + nodeSize];
    const typeName = nodeTypes[type] ?? String(type);
    const name = TYPES_WITHOUT_NAME.has(typeName)
      ? -1
      : nodes.values[offset + nodeName];
    totalSize += size;

    const typeTotal = byType.get(type) ?? { count: 0, size: 0 };
    typeTotal.count++;
    typeTotal.size += size;
    byType.set(type, typeTotal);

    const key = `${type}:${name}`;
    const group = groups.get(key) ?? { type, name, count: 0, size: 0 };
    group.count++;
    group.size += size;
    groups.set(key, group);

    if (nodeDetached >= 0 && nodes.values[offset + nodeDetached] === 2)
      detachedNodes++;

    const edgeCount = nodes.values[offset + nodeEdges];
    if (typeName === "object") {
      let hits = 0;
      for (let e = 0; e < edgeCount; e++) {
        const at = edgeOffset + e * edgeFields;
        if (
          edges[at + edgeType] === propertyEdge &&
          eventNameIds.has(edges[at + edgeName])
        ) {
          hits++;
        }
      }
      if (hits >= EVENT_PROPERTIES.length) nostrEvents++;
    }
    edgeOffset += edgeCount * edgeFields;
  }

  const sortedGroups = [...groups.values()].sort((a, b) => b.size - a.size);
  const topGroups = sortedGroups.slice(0, topCount);
  for (const group of topGroups) if (group.name >= 0) wanted.add(group.name);

  const names = readStrings(buffer, stringsStart, (index) => wanted.has(index));

  return {
    totalSize,
    nodeCount: snapshot.node_count,
    byType: [...byType]
      .map(([type, total]) => ({
        type: nodeTypes[type] ?? String(type),
        name: "",
        ...total,
      }))
      .sort((a, b) => b.size - a.size),
    top: topGroups.map((group) => ({
      type: nodeTypes[group.type] ?? String(group.type),
      name: group.name >= 0 ? (names.get(group.name) ?? "") : "",
      count: group.count,
      size: group.size,
    })),
    nostrEvents,
    detachedNodes,
  };
};
