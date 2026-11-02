import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYFRAMES, START, schedule } from "../src/story.ts";
import { COLOURWAYS, mixHex } from "../src/colourways.ts";

// A made-up page: chapters stacked in order, each 2 screens tall, on a 1000 px screen
const order = [...new Set(KEYFRAMES.map((k) => k.chapter))];
const layout = (id: string) => ({ top: order.indexOf(id) * 2000, height: 2000 });

test("every chapter in the story has a place on the page", () => {
  assert.ok(order.length >= 8);
  assert.equal(KEYFRAMES[0].chapter, "hero");
  assert.equal(KEYFRAMES[0].at, 0);
});

test("keyframes land in scroll order", () => {
  const placed = schedule(KEYFRAMES, layout, 1000);
  for (let i = 1; i < placed.length; i++) assert.ok(placed[i].y >= placed[i - 1].y, `keyframe ${i} goes backwards`);
  assert.equal(placed[0].y, 0);
});

test("a chapter's keyframes span the time it's on screen, and moving between chapters takes one screen", () => {
  const placed = schedule(KEYFRAMES, layout, 1000);
  const designIn = KEYFRAMES.findIndex((k) => k.chapter === "design" && k.at === 0);
  assert.equal(placed[designIn].y, 2000);          // design's top reaches the top of the screen
  assert.equal(placed[designIn + 1].y, 3000);      // design's bottom reaches the bottom: 2000 + (2000 - 1000)
  assert.equal(placed[designIn].y - placed[designIn - 1].y, 1000);
});

test("keyframes that set a few values keep the rest", () => {
  const placed = schedule(KEYFRAMES, layout, 1000);
  for (const p of placed) for (const key of Object.keys(START)) assert.equal(typeof p.state[key as keyof typeof START], "number", key);
  const labelsOn = placed.findIndex((p) => p.state.labels === 1);
  assert.equal(placed[labelsOn].state.explode, 1, "the labels arrive once it has come apart");
});

test("the story ends where it started: back together, no overlays", () => {
  const end = schedule(KEYFRAMES, layout, 1000).at(-1)!.state;
  assert.equal(end.explode, 0); assert.equal(end.focus, 0); assert.equal(end.labels, 0); assert.equal(end.field, 0); assert.equal(end.charge, 0);
});

test("colours mix as expected", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mixHex("#123456", "#abcdef", 0), "#123456");
  for (const c of COLOURWAYS) for (const v of [c.shell, c.metal, c.cushion, c.led, c.accent, ...c.bg]) assert.match(v, /^#[0-9a-f]{6}$/);
});

test("the soundtrack builds from the pad alone to every layer", async () => {
  const { layerLevels } = await import("../src/audio.ts");
  const quiet = layerLevels({ energy: 0, noise: 0 }), full = layerLevels({ energy: 1, noise: 0 });
  assert.equal(quiet.pad, 1);
  for (const k of ["arp", "hats", "bass", "drums"] as const) { assert.equal(quiet[k], 0, k); assert.equal(full[k], 1, k); }
  // layers come in in order as the energy rises
  const order = ["arp", "hats", "bass", "drums"] as const;
  for (let e = 0; e <= 1; e += 0.05) {
    const l = layerLevels({ energy: e, noise: 0 });
    for (let i = 1; i < order.length; i++) assert.ok(l[order[i]] <= l[order[i - 1]] + 1e-9, `${order[i]} before ${order[i - 1]} at ${e}`);
  }
});

test("the music is at its fullest in the driver and battery chapters, and the noise only plays before noise cancelling", () => {
  const placed = schedule(KEYFRAMES, layout, 1000);
  const at = (chapter: string) => placed[KEYFRAMES.findIndex((k) => k.chapter === chapter)].state;
  assert.equal(at("driver").energy, 1);
  assert.equal(at("battery").energy, 1);
  assert.ok(at("hero").energy < at("design").energy && at("design").energy < at("inside").energy);
  const ancOn = placed.find((p) => p.state.anc === 1)!.state;
  assert.equal(ancOn.field * (1 - ancOn.anc), 0);
});
