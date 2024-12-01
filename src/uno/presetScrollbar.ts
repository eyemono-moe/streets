import { colorResolver } from "@unocss/preset-mini/utils";
import type { Preset } from "unocss";

export const presetScrollbar = (): Preset => {
  return {
    name: "unocss-preset-scrollbar",
    variants: [
      {
        match: (matcher) => {
          const matches = matcher.match(
            /^(resizer|scrollbar(?:-(?:thumb|track(?:-piece)?|button|corner))?):/,
          );
          if (matches) {
            return {
              matcher: matcher.slice(matches[0].length),
              selector: (s) => `${s}::-webkit-${matches[1]}`,
            };
          }
        },
        multiPass: true,
      },
    ],
    rules: [
      [
        /^scrollbar-gutter-both$/,
        () => ({
          "scrollbar-gutter": "stable both-edges",
        }),
      ],
      [
        /^scrollbar-gutter-(auto|stable|inherit|initial|revert|revert-layer|unset)$/,
        ([, p]) => ({
          "scrollbar-gutter": p,
        }),
      ],
      [
        /^scroll(?:bar)?-(thin|none|auto)$/,
        ([, w]) => ({
          "scrollbar-width": w,
        }),
      ],
      [
        /^scroll(?:bar)?-(track|thumb)-(.+)$/,
        ([s, section, colorMatch], context) => {
          const varName = `scroll${section}-bg`;
          const opacityVarName = `--un-${varName}-opacity`;
          const colorVarName = `--un-${varName}`;
          // @ts-ignore
          const res = colorResolver("color", varName)([s, colorMatch], context);

          if (!res) {
            return;
          }

          // @ts-ignore
          const color = res.color;
          // @ts-ignore
          const opacity = res[opacityVarName];

          if (!color) {
            return;
          }

          if (opacity) {
            return {
              [opacityVarName]: opacity,
              [colorVarName]: color,
              "scrollbar-color":
                "var(--un-scrollthumb-bg) var(--un-scrolltrack-bg)",
            };
          }

          return {
            [colorVarName]: color,
            "scrollbar-color":
              "var(--un-scrollthumb-bg) var(--un-scrolltrack-bg)",
          };
        },
      ],
    ],
  };
};
