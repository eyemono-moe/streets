import type { JSX } from "solid-js/jsx-runtime";

export type SignShape = "circle" | "square" | "diamond" | "octagon";

export type RoadPattern =
  | "straight"
  | "left"
  | "right"
  | "left-branch"
  | "right-branch";

export type AvatarProps = {
  name: string;
  title?: boolean;
  size?: number | string;
} & JSX.SvgSVGAttributes<SVGSVGElement>;
