import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "./style.css";
import { DemoLoop } from "./audio.ts";
import { Callouts } from "./callouts.ts";
import { COLOURWAYS, type Colourway } from "./colourways.ts";
import { WaveField } from "./scene/field.ts";
import { Headphones } from "./scene/headphones.ts";
import { Stage } from "./scene/stage.ts";
import { KEYFRAMES, START, schedule, type State } from "./story.ts";

/**
 * The page. Scrolling drives one GSAP timeline (through ScrollTrigger) that tweens a single `state` object; every
 * frame the 3D scene reads that state. Lenis smooths the scroll itself. Nothing in the scene animates on its own
 * timer except small idle motions, so the page always looks the same at the same scroll position.
 */

gsap.registerPlugin(ScrollTrigger);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const root = document.documentElement;

/* ---------- The scene (if this browser can draw it) ---------- */

let stage: Stage | null = null;
try { stage = new Stage($<HTMLCanvasElement>("scene")); } catch { root.classList.add("no-webgl"); }
const headphones = new Headphones();
const field = new WaveField();
if (stage) stage.scene.add(headphones.root, field.mesh);
const callouts = new Callouts($("callouts"));
const loop = new DemoLoop();

const state: State = { ...START };

/* ---------- Smooth scrolling ---------- */

let lenis: Lenis | null = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
  a.addEventListener("click", (e) => {
    const target = document.querySelector<HTMLElement>(a.getAttribute("href")!);
    if (!target) return;
    e.preventDefault();
    // land where the chapter has settled: its own keyframe at 0
    if (lenis) lenis.scrollTo(target, { duration: 1.8 });
    else target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  });
}

/* ---------- The scroll timeline ---------- */

let timeline: gsap.core.Timeline | null = null;
let trigger: ScrollTrigger | null = null;

/** Build (or rebuild, after a resize) the timeline: keyframes at pixel positions, one tween between each pair. */
function buildTimeline(): void {
  trigger?.kill();
  timeline?.kill();
  const vh = innerHeight;
  const placed = schedule(KEYFRAMES, (id) => { const el = $(id); return { top: el.offsetTop, height: el.offsetHeight }; }, vh);
  const max = Math.max(1, root.scrollHeight - vh);
  Object.assign(state, placed[0].state);
  timeline = gsap.timeline({ paused: true, defaults: { ease: "power1.inOut" } });
  for (let i = 1; i < placed.length; i++) {
    const from = placed[i - 1].y, d = placed[i].y - from;
    if (d > 0) timeline.to(state, { ...placed[i].state, duration: d }, from);
    else timeline.set(state, { ...placed[i].state }, from);
  }
  timeline.set({}, {}, Math.max(max, timeline.duration())); // one second of timeline = one pixel of scroll
  trigger = ScrollTrigger.create({ start: 0, end: max, scrub: reduceMotion ? true : 0.5, animation: timeline });
}

let resizeTimer = 0;
function resize(): void {
  stage?.resize(innerWidth, innerHeight);
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { buildTimeline(); ScrollTrigger.refresh(); }, 120);
}
addEventListener("resize", resize);

/* ---------- Chapters: text arrives, the nav follows along ---------- */

const navLinks = new Map([...document.querySelectorAll<HTMLAnchorElement>(".top nav a")].map((a) => [a.hash.slice(1), a]));
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) {
    e.target.querySelector(".panel")?.classList.toggle("in", e.isIntersecting);
    navLinks.get(e.target.id)?.classList.toggle("on", e.isIntersecting);
    if (e.target.id === "driver" && !e.isIntersecting && loop.playing) togglePlay();
  }
}, { rootMargin: "-40% 0px -40% 0px" });
document.querySelectorAll("[data-chapter]").forEach((c) => seen.observe(c));

/* ---------- Colours ---------- */

let finish: Colourway = COLOURWAYS[0];
const swatches = $("swatches");
for (const c of COLOURWAYS) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "swatch"; b.dataset.name = c.name;
  b.style.setProperty("--c", c.shell);
  b.setAttribute("aria-label", c.name);
  b.addEventListener("click", () => setFinish(c));
  swatches.append(b);
}
function setFinish(c: Colourway): void {
  finish = c;
  root.style.setProperty("--bg-top", c.bg[0]);
  root.style.setProperty("--bg-bottom", c.bg[1]);
  root.style.setProperty("--accent", c.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", c.bg[1]);
  $("finish-name").textContent = c.name + ".";
  swatches.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.name === c.name)));
}
setFinish(finish);
headphones.setColourway(finish);

/* ---------- Drag to turn (where the headphones are on show: the top and the colours) ---------- */

let drag = 0, dragVel = 0, dragging: { id: number; x: number } | null = null;
const canvas = $<HTMLCanvasElement>("scene");
canvas.addEventListener("pointerdown", (e) => { if (state.sway > 0.5) { dragging = { id: e.pointerId, x: e.clientX }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener("pointermove", (e) => {
  if (dragging?.id !== e.pointerId) return;
  const dx = (e.clientX - dragging.x) * 0.01;
  drag += dx; dragVel = dx; dragging.x = e.clientX;
});
const endDrag = () => { dragging = null; };
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

/* ---------- Sound and the pre-order button ---------- */

const play = $<HTMLButtonElement>("play");
function togglePlay(): void {
  if (loop.playing) loop.stop(); else loop.start();
  play.setAttribute("aria-pressed", String(loop.playing));
  play.querySelector(".label")!.textContent = loop.playing ? "Stop the demo loop" : "Play the demo loop";
}
play.addEventListener("click", togglePlay);

let toastTimer = 0;
$("preorder").addEventListener("click", () => {
  const t = $("toast");
  t.textContent = "Soundline is a concept, so there's nothing to buy. Thanks for scrolling all the way down, though.";
  t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove("on"), 4200);
});

/* ---------- Each frame ---------- */

const target = new THREE.Vector3();
const ledColour = new THREE.Color();
const hours = $("hours"), db = $("anc-db"), progress = $("progress");
let lastHours = -1, lastDb = -1, last = performance.now();

function frame(): void {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000), t = now / 1000;
  last = now;

  // HTML that follows the scroll
  const h = Math.round(state.charge * 60);
  if (h !== lastHours) { hours.textContent = String(h); lastHours = h; }
  const d = Math.round(state.anc * 38);
  if (d !== lastDb) { db.textContent = d ? `−${d} dB` : "0 dB"; lastDb = d; }
  progress.style.transform = `scaleX(${trigger ? trigger.progress : 0})`;

  if (!stage) return;

  // the finish eases to the chosen colourway
  headphones.setColourway(finish, 1 - Math.exp(-dt * 5));
  // a slow sway on show, plus whatever the visitor has dragged (which drifts back when they let go)
  if (!dragging) { drag += dragVel; dragVel *= 0.92; if (state.sway < 0.5) drag *= 0.94; }
  const sway = reduceMotion ? 0 : Math.sin(t * 0.45) * 0.28;
  headphones.root.rotation.y = (sway + drag) * state.sway + drag * (1 - state.sway);
  headphones.setExplode(state.explode, state.focus);
  headphones.setCharge(state.charge);
  headphones.drive = loop.level();
  headphones.update(reduceMotion ? 0 : t);
  field.update(t, state.field, state.anc, ledColour.set(finish.led));

  target.set(state.tx, state.ty, state.tz);
  stage.shift = state.shift;
  stage.lift = state.lift;
  stage.look(target, state.yaw, state.pitch, state.dist);
  (stage.shadow.material as THREE.MeshBasicMaterial).opacity = 1 - Math.min(1, state.explode) * 0.75;
  callouts.update(headphones.root, headphones.anchors, stage.camera, state.labels, innerWidth, innerHeight);
  stage.render();
}

/* ---------- Start ---------- */

resize();
buildTimeline();
gsap.ticker.add(frame);
// the fonts change the page's height a little: rebuild once they're in, then lift the curtain
void document.fonts.ready.then(() => {
  buildTimeline();
  ScrollTrigger.refresh();
  requestAnimationFrame(() => root.classList.add("loaded"));
});
setTimeout(() => root.classList.add("loaded"), 2500); // never leave the curtain down

// ?debug: lets automated tests read the state and jump to a scroll position without smoothing
if (new URLSearchParams(location.search).has("debug")) {
  (window as unknown as { soundline: object }).soundline = {
    state,
    jump: (y: number) => { if (lenis) lenis.scrollTo(y, { immediate: true }); else scrollTo(0, y); ScrollTrigger.update(); trigger?.animation?.progress(trigger.progress); },
    chapterTop: (id: string) => $(id).offsetTop,
    chapterHeight: (id: string) => $(id).offsetHeight
  };
}
