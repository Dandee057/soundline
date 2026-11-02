/** The four finishes. Each sets the shell, the metalwork, the cushions, the status light and the page behind. */
export interface Colourway {
  id: string;
  name: string;
  shell: string;
  metal: string;
  cushion: string;
  led: string;
  /** The page background (top and bottom of a gradient) and the accent used for text highlights. */
  bg: [string, string];
  accent: string;
}

export const COLOURWAYS: Colourway[] = [
  { id: "graphite", name: "Graphite", shell: "#2a2c30", metal: "#a4aab2", cushion: "#1c1d20", led: "#7cc4ff", bg: ["#16181c", "#0a0b0d"], accent: "#8fd0ff" },
  { id: "sand", name: "Sand", shell: "#d8c8ad", metal: "#c7ae86", cushion: "#ece3d3", led: "#ffb36b", bg: ["#2a231b", "#120f0b"], accent: "#f2c48a" },
  { id: "sage", name: "Sage", shell: "#8ca08a", metal: "#c9cec5", cushion: "#dde3d8", led: "#9dffb8", bg: ["#18211c", "#0a0e0b"], accent: "#a9e6bd" },
  { id: "coral", name: "Coral", shell: "#e46f58", metal: "#f0d6ca", cushion: "#f5e2da", led: "#ffd3a8", bg: ["#2a1612", "#120a08"], accent: "#ffab94" }
];

/** Mix two #rrggbb colours: t = 0 gives a, 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parse(a), pb = parse(b);
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function parse(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
