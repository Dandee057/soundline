/**
 * The scroll story: what the 3D scene looks like at points down the page. Each keyframe is pinned to a chapter
 * (a <section>) and a point within it: 0 is when the chapter's top reaches the top of the screen, 1 is when its
 * bottom reaches the bottom. Between keyframes everything eases from one to the next as you scroll.
 */

export interface State {
  /** Camera: orbit round a target point. */
  yaw: number; pitch: number; dist: number; tx: number; ty: number; tz: number;
  /** Shift the picture sideways (fraction of the screen width) to make room for text; on a phone, `lift` moves it
   *  up instead (the text sits in a sheet at the bottom), or down for the title. */
  shift: number; lift: number;
  /** The headphones: gentle sway, exploded view, driver close-up (moves the cushions away). */
  sway: number; explode: number; focus: number;
  /** Overlays: part labels, the noise-cancelling wave field, the battery's charge. */
  labels: number; field: number; anc: number; charge: number;
  /** The soundtrack: 0 is just the pad, 1 brings in every layer (see audio.ts). */
  energy: number;
}

export interface Keyframe { chapter: string; at: number; state: Partial<State> }

export const START: State = {
  yaw: -0.45, pitch: 0.06, dist: 10.6, tx: 0, ty: 1.3, tz: 0, shift: 0, lift: -0.06,
  sway: 1, explode: 0, focus: 0, labels: 0, field: 0, anc: 0, charge: 0, energy: 0.1
};

export const KEYFRAMES: Keyframe[] = [
  { chapter: "hero", at: 0, state: {} },
  { chapter: "hero", at: 1, state: { yaw: -0.15, dist: 9.4, ty: 1.0, energy: 0.25 } },
  // Design: side-on, to the left of the text
  { chapter: "design", at: 0, state: { yaw: 1.15, pitch: 0.2, dist: 7, ty: 0.45, shift: -0.2, lift: 0.17, sway: 0, energy: 0.42 } },
  { chapter: "design", at: 1, state: { yaw: 1.5, pitch: 0.1 } },
  // Inside: it comes apart, then the labels arrive
  { chapter: "inside", at: 0, state: { yaw: 0.95, pitch: 0.22, dist: 11.5, tx: 1.0, ty: 0.55, shift: 0.08, explode: 0.12, energy: 0.62 } },
  { chapter: "inside", at: 0.4, state: { explode: 1 } },
  { chapter: "inside", at: 0.55, state: { labels: 1 } },
  { chapter: "inside", at: 1, state: { yaw: 1.1, labels: 1 } },
  // Driver: in close, from the ear's side, with the cushion and grille moved away
  { chapter: "driver", at: 0, state: { labels: 0, focus: 1, yaw: -1.2, pitch: 0.1, dist: 2.7, tx: 1.1, ty: 0, tz: 0, shift: -0.24, energy: 1 } },
  { chapter: "driver", at: 1, state: { yaw: -1.4, dist: 2.4 } },
  // Quiet: back together, the noise field appears, then scrolling switches noise cancelling on
  { chapter: "quiet", at: 0, state: { focus: 0, explode: 0, yaw: 0.3, pitch: 0.16, dist: 8.8, tx: 0, ty: 0.45, shift: -0.18, field: 1, anc: 0, energy: 0.65 } },
  { chapter: "quiet", at: 0.75, state: { anc: 1 } },
  { chapter: "quiet", at: 1, state: { yaw: 0.12 } },
  // Battery: the cup opens up and the cell charges as you scroll
  { chapter: "battery", at: 0, state: { field: 0, anc: 0, explode: 0.75, yaw: 0.7, pitch: 0.16, dist: 6.8, tx: 1.75, ty: 0.35, shift: 0.2, charge: 0, energy: 1 } },
  { chapter: "battery", at: 0.8, state: { charge: 1 } },
  { chapter: "battery", at: 1, state: { yaw: 0.9 } },
  // Colours: whole again, centred, swaying, and you can drag it round
  { chapter: "colours", at: 0, state: { explode: 0, charge: 0, yaw: 0.5, pitch: 0.14, dist: 8.8, tx: 0, ty: -0.35, shift: 0, sway: 1, energy: 0.55 } },
  { chapter: "colours", at: 1, state: { yaw: 0.6 } },
  // The end: pulled back and to the right of the specs
  { chapter: "buy", at: 0, state: { yaw: -0.55, pitch: 0.3, dist: 8.6, ty: 0.4, shift: 0.22, energy: 0.3 } }
];

export interface Placed { y: number; state: State }

/**
 * Turn the keyframes into scroll positions (px) with complete states, given where each chapter is on the page.
 * A keyframe that only sets a few values keeps the rest from the keyframe before it.
 */
export function schedule(keys: Keyframe[], chapter: (id: string) => { top: number; height: number }, viewport: number): Placed[] {
  let state = { ...START };
  const out: Placed[] = [];
  for (const k of keys) {
    const c = chapter(k.chapter);
    const y = Math.round(c.top + k.at * Math.max(0, c.height - viewport));
    state = { ...state, ...k.state };
    const prev = out[out.length - 1];
    out.push({ y: prev ? Math.max(prev.y, y) : y, state });
  }
  return out;
}
