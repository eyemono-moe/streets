import { boardPalettes, skyPalettes } from "./palettes";
import { createRandom, hashString, pick, randomRange } from "./random";
import type { RoadPattern, SignShape } from "./types";

const shapes: SignShape[] = ["circle", "square", "diamond", "octagon"];
const patterns: RoadPattern[] = [
  "straight",
  "left",
  "right",
  "left-branch",
  "right-branch",
];

export const generateSign = (id: string) => {
  const random = createRandom(hashString(id));

  const palette = pick(random, boardPalettes);

  return {
    boardBgColor: palette.bg,
    boardFgColor: palette.fg,
    skyColor: pick(random, skyPalettes),
    pattern: pick(random, patterns),
    boardShape: pick(random, shapes),
    faceRotation: randomRange(random, -15, 15),
    boardRotation: randomRange(random, -15, 15),
    isMouthOpen: random() > 0.5,
    translateX: randomRange(random, -40, 40),
    translateY: randomRange(random, 0, 40),
    scale: randomRange(random, 1, 1.2),
  };
};
