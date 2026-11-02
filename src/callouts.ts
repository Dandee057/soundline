import * as THREE from "three";
import type { AnchorName } from "./scene/headphones.ts";

/**
 * Labels for the exploded view: HTML text pinned to points on the 3D parts. Every frame each anchor is projected
 * to the screen; the labels line up in a column beside the product, each joined to its part by a thin line.
 * Being HTML, the labels stay sharp, readable by screen readers and selectable like the rest of the page.
 */

export interface Callout { anchor: AnchorName; title: string; detail: string }

export const CALLOUTS: Callout[] = [
  { anchor: "band", title: "Steel-core headband", detail: "Flexes to fit, never creaks" },
  { anchor: "cushion", title: "Memory-foam cushions", detail: "Slow-rebound foam, magnetic fit" },
  { anchor: "driver", title: "40 mm driver", detail: "Beryllium-coated dome" },
  { anchor: "mics", title: "Six microphones", detail: "Three on each cup listen to the room" },
  { anchor: "battery", title: "1200 mAh cell", detail: "60 hours with noise cancelling on" },
  { anchor: "board", title: "Arc chip", detail: "Cancels noise 48,000 times a second" },
  { anchor: "cap", title: "Status ring", detail: "Battery and mode at a glance" }
];

export class Callouts {
  private root: HTMLElement;
  private svg: SVGSVGElement;
  private items: { c: Callout; el: HTMLElement; line: SVGLineElement; dot: SVGCircleElement }[] = [];
  private v = new THREE.Vector3();
  private box = new THREE.Box3();

  constructor(root: HTMLElement) {
    this.root = root;
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.root.append(this.svg);
    for (const c of CALLOUTS) {
      const el = document.createElement("div");
      el.className = "callout";
      el.innerHTML = `<b></b><span></span>`;
      el.querySelector("b")!.textContent = c.title;
      el.querySelector("span")!.textContent = c.detail;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("r", "3.5");
      this.svg.append(line, dot);
      this.root.append(el);
      this.items.push({ c, el, line, dot });
    }
  }

  update(product: THREE.Object3D, anchors: Record<AnchorName, THREE.Object3D>, camera: THREE.Camera, opacity: number, w: number, h: number): void {
    this.root.style.opacity = String(opacity);
    this.root.style.visibility = opacity < 0.02 ? "hidden" : "visible";
    if (opacity < 0.02) return;
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const toScreen = (p: THREE.Vector3) => { const q = p.clone().project(camera); return [(q.x + 1) / 2 * w, (1 - q.y) / 2 * h] as const; };
    // Labels line up in a column just right of the product, in the same top-to-bottom order as their parts,
    // so the leader lines don't cross each other
    this.box.setFromObject(product);
    let right = 0;
    for (let i = 0; i < 8; i++) {
      this.v.set(i & 1 ? this.box.max.x : this.box.min.x, i & 2 ? this.box.max.y : this.box.min.y, i & 4 ? this.box.max.z : this.box.min.z);
      right = Math.max(right, toScreen(this.v)[0]);
    }
    const labelW = Math.min(220, w * 0.34), gap = w < 700 ? 30 : 46;
    const x = Math.min(w - labelW - 12, right + 28);
    const spots = this.items.map((it) => {
      anchors[it.c.anchor].getWorldPosition(this.v);
      const [ax, ay] = toScreen(this.v);
      return { it, ax, ay, y: ay };
    }).sort((a, b) => a.ay - b.ay);
    for (let i = 1; i < spots.length; i++) if (spots[i].y - spots[i - 1].y < gap) spots[i].y = spots[i - 1].y + gap;
    const overflow = spots[spots.length - 1].y - (h - 40);
    if (overflow > 0) for (const s of spots) s.y -= overflow;
    for (const s of spots) {
      const lx = x, ly = Math.max(80, s.y);
      s.it.el.style.transform = `translate(${lx}px, ${ly}px) translate(0, -50%)`;
      s.it.line.setAttribute("x1", String(s.ax)); s.it.line.setAttribute("y1", String(s.ay));
      s.it.line.setAttribute("x2", String(lx - 6)); s.it.line.setAttribute("y2", String(ly));
      s.it.dot.setAttribute("cx", String(s.ax)); s.it.dot.setAttribute("cy", String(s.ay));
    }
  }
}
