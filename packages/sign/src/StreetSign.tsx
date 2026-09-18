import {
  type Component,
  Match,
  Show,
  Switch,
  createMemo,
  createUniqueId,
  splitProps,
} from "solid-js";
import { boardPalettes, skyPalettes } from "./palettes";
import { createRandom, hashString, pick, randomRange } from "./random";
import type { AvatarProps, RoadPattern, SignShape } from "./types";

const shapes: SignShape[] = ["circle", "square", "diamond", "octagon"];
const patterns: RoadPattern[] = [
  "straight",
  "left",
  "right",
  "left-branch",
  "right-branch",
];

const facePositionMap: Record<RoadPattern, { x: number; y: number }> = {
  straight: { x: 150, y: 77 },
  left: { x: 66, y: 108 },
  right: { x: 234, y: 108 },
  "left-branch": { x: 212, y: 68 },
  "right-branch": { x: 88, y: 68 },
};

const SIZE = 400;

const generateSign = (id: string) => {
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

export const StreetSign: Component<AvatarProps> = (props) => {
  const avatar = createMemo(() => generateSign(props.name));
  const maskID = createUniqueId();

  const [localProps, restProps] = splitProps(props, ["name", "size", "title"]);

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: show when title is provided
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={localProps.size || SIZE}
      height={localProps.size || SIZE}
      {...restProps}
    >
      <Show when={localProps.title}>
        <title>{localProps.name}</title>
      </Show>
      <mask
        id={maskID}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={SIZE}
        height={SIZE}
      >
        <rect width={SIZE} height={SIZE} fill="#FFFFFF" />
      </mask>
      <rect width={SIZE} height={SIZE} fill={avatar().skyColor} />
      <g mask={`url(#${maskID})`}>
        <g
          transform={`translate(200 200) scale(${avatar().scale}) translate(-200 -200) translate(${avatar().translateX} ${avatar().translateY}) rotate(${avatar().boardRotation} 200 200)`}
        >
          <Switch>
            <Match when={avatar().boardShape === "circle"}>
              <circle cx="200" cy="200" r="229" fill={avatar().boardBgColor} />
              <circle
                cx="200"
                cy="200"
                r="221"
                stroke={avatar().boardFgColor}
                stroke-width="6"
                fill="none"
              />
            </Match>
            <Match when={avatar().boardShape === "square"}>
              <rect
                width="400"
                height="400"
                rx="32"
                fill={avatar().boardBgColor}
              />
              <rect
                x="9"
                y="9"
                width="382"
                height="382"
                rx="23"
                stroke={avatar().boardFgColor}
                stroke-width="6"
                fill="none"
              />
            </Match>
            <Match when={avatar().boardShape === "diamond"}>
              <path
                d="M177.373 -49.3726C189.869 -61.8693 210.131 -61.8694 222.627 -49.3726L449.373 177.373C461.869 189.869 461.869 210.131 449.373 222.627L222.627 449.373C210.131 461.869 189.869 461.869 177.373 449.373L-49.3726 222.627C-61.8693 210.131 -61.8694 189.869 -49.3726 177.373L177.373 -49.3726Z"
                fill={avatar().boardBgColor}
              />
              <path
                d="M183.736 -43.0092C192.718 -51.9912 207.282 -51.9912 216.264 -43.0092L443.009 183.737C451.99 192.719 451.991 207.281 443.009 216.263L216.264 443.008C207.282 451.99 192.718 451.99 183.736 443.008L-43.0089 216.263C-51.9906 207.281 -51.9905 192.719 -43.0089 183.737L183.736 -43.0092Z"
                stroke={avatar().boardFgColor}
                stroke-width="6"
                fill="none"
              />
            </Match>
            <Match when={avatar().boardShape === "octagon"}>
              <path
                d="M100.669 -9.053C106.426 -14.81 114.234 -18.0442 122.376 -18.0442L277.542 -18.0442C285.684 -18.0442 293.492 -14.8099 299.249 -9.05298L408.968 100.666C414.725 106.423 417.959 114.231 417.959 122.373L417.959 277.539C417.959 285.68 414.725 293.489 408.968 299.246L299.249 408.965C293.492 414.722 285.684 417.956 277.542 417.956L122.376 417.956C114.234 417.956 106.426 414.722 100.669 408.965L-9.04981 299.246C-14.8068 293.489 -18.041 285.681 -18.041 277.539L-18.041 122.373C-18.041 114.231 -14.8068 106.423 -9.0498 100.666L100.669 -9.053Z"
                fill={avatar().boardBgColor}
              />
              <path
                d="M124.552 -9H275.448C282.57 -8.99988 289.4 -6.17057 294.436 -1.13477L401.135 105.564C406.171 110.6 409 117.43 409 124.552V275.448C409 282.57 406.171 289.4 401.135 294.436L294.436 401.135C289.4 406.171 282.57 409 275.448 409H124.552C117.43 409 110.6 406.171 105.564 401.135L-1.13477 294.436C-6.17057 289.4 -8.99988 282.57 -9 275.448V124.552C-8.99987 117.43 -6.17056 110.6 -1.13477 105.564L105.564 -1.13477C110.6 -6.17056 117.43 -8.99987 124.552 -9Z"
                stroke={avatar().boardFgColor}
                stroke-width="6"
                fill="none"
              />
            </Match>
          </Switch>
          <Switch>
            <Match when={avatar().pattern === "straight"}>
              <path
                d="M197.542 15.9464C199.084 13.2941 202.915 13.2941 204.458 15.9464L298.8 178.179C302.028 183.731 296.699 190.337 290.59 188.357L232 169.363V388C232 390.209 230.209 392 228 392H174C171.791 392 170 390.209 170 388V169.363L111.41 188.357C105.3 190.337 99.9722 183.731 103.201 178.179L197.542 15.9464Z"
                fill={avatar().boardFgColor}
              />
            </Match>
            <Match when={avatar().pattern === "left"}>
              <path
                d="M184.179 60.2009C189.731 56.9722 196.337 62.3001 194.357 68.4099L175.364 127H196.997L197.003 127.006C213.208 127.135 229.241 130.387 244.219 136.591C259.506 142.923 273.397 152.204 285.097 163.904C296.797 175.604 306.078 189.495 312.41 204.782C318.742 220.069 322.001 236.454 322.001 253V338C322.001 340.209 320.21 342 318.001 342H264.001C261.792 342 260.001 340.209 260.001 338V253C260.001 244.595 258.345 236.272 255.129 228.508C251.913 220.743 247.199 213.688 241.256 207.745C235.313 201.802 228.258 197.088 220.493 193.872C212.971 190.756 204.925 189.105 196.788 189.005L196.001 189H175.363L194.357 247.59C196.337 253.699 189.731 259.028 184.179 255.8L21.9464 161.458C19.2941 159.915 19.2941 156.084 21.9464 154.542L184.179 60.2009Z"
                fill={avatar().boardFgColor}
              />
            </Match>
            <Match when={avatar().pattern === "right"}>
              <path
                d="M215.821 60.2009C210.269 56.9722 203.663 62.3001 205.643 68.4099L224.636 127H203.003L202.997 127.006C186.792 127.135 170.759 130.387 155.781 136.591C140.494 142.923 126.603 152.204 114.903 163.904C103.203 175.604 93.9218 189.495 87.5898 204.782C81.2579 220.069 77.999 236.454 77.999 253V338C77.9991 340.209 79.7901 342 81.999 342H135.999C138.208 342 139.999 340.209 139.999 338V253C139.999 244.595 141.655 236.272 144.871 228.508C148.087 220.743 152.801 213.688 158.744 207.745C164.687 201.802 171.742 197.088 179.507 193.872C187.029 190.756 195.075 189.105 203.212 189.005L203.999 189H224.637L205.643 247.59C203.663 253.699 210.269 259.028 215.821 255.8L378.054 161.458C380.706 159.915 380.706 156.084 378.054 154.542L215.821 60.2009Z"
                fill={avatar().boardFgColor}
              />
            </Match>
            <Match when={avatar().pattern === "left-branch"}>
              <path
                d="M258.552 17.87C260.098 15.2388 263.903 15.2386 265.449 17.87L346.709 156.184C349.965 161.727 344.655 168.36 338.535 166.396L291 151.143V371C291 373.209 289.209 375 287 375H237C234.791 375 233 373.209 233 371V341L232.996 340.385C232.918 334.028 231.628 327.743 229.194 321.866C226.681 315.8 222.998 310.287 218.355 305.644C213.712 301.002 208.2 297.318 202.134 294.806C196.068 292.293 189.565 291 183 291H151.144L166.396 338.534C168.36 344.655 161.727 349.965 156.184 346.709L17.8699 265.449C15.2385 263.903 15.2387 260.098 17.8699 258.552L156.184 177.292C161.727 174.036 168.36 179.345 166.396 185.466L151.144 233H183C197.182 233 211.227 235.793 224.33 241.221C225.245 241.6 226.155 241.992 227.058 242.395C229.801 243.621 232.999 241.674 233 238.67V151.143L185.466 166.396C179.345 168.36 174.036 161.727 177.292 156.184L258.552 17.87Z"
                fill={avatar().boardFgColor}
              />
            </Match>
            <Match when={avatar().pattern === "right-branch"}>
              <path
                d="M141.448 17.87C139.902 15.2388 136.097 15.2386 134.551 17.87L53.2912 156.184C50.0352 161.727 55.3445 168.36 61.465 166.396L109 151.143V371C109 373.209 110.791 375 113 375H163C165.209 375 167 373.209 167 371V341L167.004 340.385C167.082 334.028 168.372 327.743 170.806 321.866C173.319 315.8 177.002 310.287 181.645 305.644C186.288 301.002 191.8 297.318 197.866 294.806C203.932 292.293 210.435 291 217 291H248.856L233.604 338.534C231.64 344.655 238.273 349.965 243.816 346.709L382.13 265.449C384.761 263.903 384.761 260.098 382.13 258.552L243.816 177.292C238.273 174.036 231.64 179.345 233.604 185.466L248.856 233H217C202.818 233 188.773 235.793 175.67 241.221C174.755 241.6 173.845 241.992 172.942 242.395C170.199 243.621 167.001 241.674 167 238.67V151.143L214.534 166.396C220.655 168.36 225.964 161.727 222.708 156.184L141.448 17.87Z"
                fill={avatar().boardFgColor}
              />
            </Match>
          </Switch>
          <g
            transform={`translate(${facePositionMap[avatar().pattern].x} ${facePositionMap[avatar().pattern].y}) rotate(${avatar().faceRotation} 50 50)`}
          >
            <ellipse
              cx="9.5"
              cy="45"
              rx="9.5"
              ry="13"
              fill={avatar().boardBgColor}
            />
            <ellipse
              cx="90.5"
              cy="45"
              rx="9.5"
              ry="13"
              fill={avatar().boardBgColor}
            />
            <Switch
              fallback={
                <path
                  d="M32 61C38.5 69.5 58.5 71.5 68.5 62"
                  stroke={avatar().boardBgColor}
                  stroke-width="6"
                  stroke-linecap="round"
                  fill="none"
                />
              }
            >
              <Match when={avatar().isMouthOpen}>
                <path
                  d="M32.0178 63.5C36.0178 80 65.9825 80 68.5 61.5C68.8402 59 31.0681 59.5824 32.0178 63.5Z"
                  stroke={avatar().boardBgColor}
                  stroke-width="6"
                  stroke-linecap="round"
                  fill={avatar().boardBgColor}
                />
              </Match>
            </Switch>
          </g>
        </g>
      </g>
    </svg>
  );
};
