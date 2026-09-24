export function hashString(value: string): number {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createRandom(seed: number) {
  let state = seed;

  return () => {
    let t = (state += 0x6d2b79f5);

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: () => number, values: readonly T[]): T {
  // random() * values.length will always be in the range of 0 to values.length - 1
  return values[Math.floor(random() * values.length)]!;
}

export function randomRange(
  random: () => number,
  min: number,
  max: number,
): number {
  return min + random() * (max - min);
}

export function randomInt(
  random: () => number,
  min: number,
  max: number,
): number {
  return Math.floor(randomRange(random, min, max + 1));
}
