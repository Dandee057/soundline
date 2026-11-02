import * as THREE from "three";
import type { Colourway } from "../colourways.ts";
import { latheX, roundedBox, roundedOutline, sweepXY } from "./geometry.ts";
import { batteryTexture, grilleTexture, pcbTexture } from "./textures.ts";

/**
 * The Soundline Arc, built from code. Each ear cup is a stack of parts on its own axis (pointing out from the
 * head), so the exploded view is just every part sliding along that axis by its own amount:
 *
 *   head side  ←  cushion · grille · driver · housing · battery · board · cap  →  outside
 *
 * Units are roughly decimetres: the headphones are about 2.6 wide and 2.4 tall.
 */

/** Where a part sits when assembled, and how far it slides out along the cup's axis when fully exploded. */
interface Part { obj: THREE.Object3D; base: THREE.Vector3; out: number }

interface Side {
  group: THREE.Group;
  base: THREE.Vector3;
  parts: Record<"cushion" | "grille" | "driver" | "housing" | "battery" | "board" | "cap", Part>;
}

/** Points the page's labels are pinned to (on the right-hand cup). */
export type AnchorName = "cushion" | "driver" | "battery" | "board" | "cap" | "mics" | "band";

const CUP_X = 1.12;          // centre of each cup from the middle
const CUP_SCALE = new THREE.Vector3(1, 1.12, 0.94); // cups are a little taller than they are wide
const BAND_LIFT = 0.5;       // how far the headband rises in the exploded view
const SIDE_SPREAD = 0.3;     // how far each whole side moves out

export class Headphones {
  readonly root = new THREE.Group();
  readonly anchors = {} as Record<AnchorName, THREE.Object3D>;
  private band = new THREE.Group();
  private sides: Side[] = [];
  private cones: THREE.Mesh[] = [];
  private mats = {
    shell: new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    shellInner: new THREE.MeshStandardMaterial({ color: "#121316", roughness: 0.8 }),
    metal: new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.26 }),
    cushion: new THREE.MeshPhysicalMaterial({ roughness: 0.92, sheen: 1, sheenRoughness: 0.55 }),
    grille: new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }),
    cone: new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.7, side: THREE.DoubleSide }),
    rubber: new THREE.MeshStandardMaterial({ color: "#141518", roughness: 0.85 }),
    magnet: new THREE.MeshPhysicalMaterial({ color: "#8d949c", metalness: 1, roughness: 0.35 }),
    copper: new THREE.MeshPhysicalMaterial({ color: "#c77b4a", metalness: 1, roughness: 0.3 }),
    battery: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2, emissive: "#5bd1a0", emissiveIntensity: 0 }),
    board: new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 }),
    chip: new THREE.MeshStandardMaterial({ color: "#16181b", roughness: 0.4, metalness: 0.4 }),
    led: new THREE.MeshBasicMaterial({ toneMapped: false })
  };
  /** 0..1: how hard the drivers are pushed (sound), drives the cone movement. */
  drive = 0;

  constructor() {
    this.mats.grille.alphaMap = grilleTexture();
    this.mats.battery.map = batteryTexture();
    this.mats.board.map = pcbTexture();
    this.buildBand();
    for (const dir of [1, -1]) this.sides.push(this.buildSide(dir));
    this.root.add(this.band, ...this.sides.map((s) => s.group));
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /* ---------- The headband ---------- */

  private buildBand(): void {
    const arch = (rx: number, ry: number, y0: number, t0: number, t1: number) => new Arch(rx, ry, y0, t0, t1);
    const outer = new THREE.Mesh(sweepXY(arch(CUP_X + 0.2, 0.8, 0.98, 0, Math.PI), { thickness: 0.07, width: 0.3, roundness: 5 }, 128), this.mats.shell);
    const pad = new THREE.Mesh(sweepXY(arch(CUP_X - 0.02, 0.68, 0.98, 0.2 * Math.PI, 0.8 * Math.PI), { thickness: 0.12, width: 0.25, roundness: 3 }, 96), this.mats.cushion);
    // the metal hinge blocks where the sliders come out
    for (const s of [1, -1]) {
      const hinge = new THREE.Mesh(roundedBox(0.14, 0.16, 0.3, 0.04), this.mats.metal);
      hinge.position.set(s * (CUP_X + 0.2), 0.98, 0);
      this.band.add(hinge);
    }
    this.band.add(outer, pad);
    this.anchors.band = this.pin(this.band, 0.75, 1.72, 0.12);
  }

  /* ---------- An ear cup (dir = 1 is the right-hand side) ---------- */

  private buildSide(dir: number): Side {
    const group = new THREE.Group();
    group.position.set(dir * CUP_X, 0, 0);
    group.rotation.y = dir > 0 ? 0 : Math.PI; // the left side is the right side turned round, so +x is always "out"
    const cup = new THREE.Group();
    cup.scale.copy(CUP_SCALE);
    group.add(cup);

    const part = (obj: THREE.Object3D, out: number): Part => { cup.add(obj); return { obj, base: obj.position.clone(), out }; };

    // Cushion: a soft ring against the head
    const cushion = new THREE.Mesh(latheX(roundedOutline([[0.27, -0.2], [0.53, -0.2], [0.56, 0], [0.29, 0]], 0.075, 8), 96), this.mats.cushion);

    // Grille in front of the driver
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.5, 72).rotateY(-Math.PI / 2), this.mats.grille);
    grille.position.x = 0.012;

    // Driver: cone, rubber surround, dust cap, voice coil, magnet and a basket round it
    const driver = new THREE.Group();
    const cone = new THREE.Mesh(latheX([[0.08, 0.13], [0.2, 0.09], [0.35, 0.055]], 72), this.mats.cone);
    const surround = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.024, 12, 72).rotateY(Math.PI / 2), this.mats.rubber);
    surround.position.x = 0.05;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2), this.mats.cone);
    cap.position.x = 0.125;
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 40, 1, true).rotateZ(Math.PI / 2), this.mats.copper);
    coil.position.x = 0.16;
    const magnet = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 48).rotateZ(Math.PI / 2), this.mats.magnet);
    magnet.position.x = 0.22;
    const basket = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 8, 72).rotateY(Math.PI / 2), this.mats.metal);
    basket.position.x = 0.05;
    for (let k = 0; k < 4; k++) {
      // four struts from the basket's rim back to the magnet
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const from = new THREE.Vector3(0.05, Math.cos(a) * 0.39, Math.sin(a) * 0.39), to = new THREE.Vector3(0.22, Math.cos(a) * 0.15, Math.sin(a) * 0.15);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, from.distanceTo(to)), this.mats.metal);
      strut.position.copy(from).add(to).multiplyScalar(0.5);
      strut.lookAt(to);
      driver.add(strut);
    }
    driver.add(cone, surround, cap, coil, magnet, basket);
    this.cones.push(cone, cap);

    // Housing: the cup's outer shell, with its dark inside
    const housing = new THREE.Group();
    const shellOutline = roundedOutline([[0.565, 0], [0.55, 0.27], [0.48, 0.385], [0.45, 0.355], [0.515, 0.26], [0.53, 0.02]], 0.014, 5);
    housing.add(new THREE.Mesh(latheX(shellOutline, 96), this.mats.shell));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.46, 64).rotateY(Math.PI / 2), this.mats.shellInner);
    inner.position.x = 0.3;
    housing.add(inner);
    // the six microphones: three small ports round each cup's rim
    for (const a of [-0.7, 0, 0.7]) {
      const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 16).rotateZ(Math.PI / 2), this.mats.rubber);
      mic.position.set(0.3, Math.cos(a) * 0.54, Math.sin(a) * 0.54);
      mic.lookAt(mic.position.clone().multiplyScalar(2).setX(0.3));
      mic.rotateX(Math.PI / 2);
      housing.add(mic);
    }

    // Battery, flat behind the driver
    const battery = new THREE.Mesh(roundedBox(0.4, 0.25, 0.07, 0.03).rotateY(Math.PI / 2), [this.mats.battery, this.mats.battery]);
    battery.position.x = 0.27;
    if (dir < 0) battery.rotation.x = Math.PI; // keep the label upright on both sides

    // Circuit board, with a few chips and the ANC processor
    const board = new THREE.Group();
    board.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.018, 64).rotateZ(Math.PI / 2), this.mats.board));
    for (const [y, z, w, h] of [[0.06, -0.05, 0.16, 0.16], [-0.16, 0.12, 0.09, 0.12], [0.2, 0.15, 0.08, 0.06], [-0.12, -0.2, 0.1, 0.07]]) {
      const chip = new THREE.Mesh(roundedBox(w, h, 0.03, 0.008, 2).rotateY(Math.PI / 2), this.mats.chip);
      chip.position.set(0.022, y, z);
      board.add(chip);
    }
    board.position.x = 0.33;

    // Outer cap, slightly domed, with the status light ring
    const capGroup = new THREE.Group();
    capGroup.add(new THREE.Mesh(latheX(roundedOutline([[0.001, 0.37], [0.49, 0.37], [0.505, 0.405], [0.43, 0.448], [0.001, 0.458]], 0.012, 5), 96), this.mats.shell));
    const led = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.006, 8, 96).rotateY(Math.PI / 2), this.mats.led);
    led.position.x = 0.452;
    capGroup.add(led);

    // Yoke and slider: the metal fork the cup swivels in, and the rod up into the headband
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.032, 16, 72, Math.PI).rotateY(Math.PI / 2), this.mats.metal);
    yoke.scale.set(1, 1.1, 0.95);
    yoke.position.x = 0.2;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.34, 20), this.mats.metal);
    rod.position.set(0.2, 0.84, 0);
    for (const s of [1, -1]) {
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 24).rotateX(Math.PI / 2), this.mats.metal);
      pivot.position.set(0.2, 0, s * 0.565 * CUP_SCALE.z);
      group.add(pivot);
    }
    group.add(yoke, rod);

    const side: Side = {
      group, base: group.position.clone(),
      parts: {
        cushion: part(cushion, -0.95), grille: part(grille, -0.66), driver: part(driver, -0.38), housing: part(housing, 0),
        battery: part(battery, 0.5), board: part(board, 0.86), cap: part(capGroup, 1.2)
      }
    };
    if (dir > 0) {
      this.anchors.cushion = this.pin(cushion, -0.1, 0.42, 0.2);
      this.anchors.driver = this.pin(driver, 0.1, 0.3, 0.12);
      this.anchors.battery = this.pin(battery, 0, 0.13, 0.1);
      this.anchors.board = this.pin(board, 0.02, 0.22, -0.18);
      this.anchors.cap = this.pin(capGroup, 0.455, 0.3, 0);
      this.anchors.mics = this.pin(housing, 0.3, 0.54, 0);
    }
    return side;
  }

  /** An empty point fixed to a part, for a label to follow. */
  private pin(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }

  /* ---------- Per frame ---------- */

  /**
   * explode: 0 assembled … 1 every part apart.
   * focus: 0 … 1 moves the cushion and grille out of the way, for the close-up of the driver.
   */
  setExplode(explode: number, focus: number): void {
    const e = smooth(explode);
    this.band.position.y = e * BAND_LIFT;
    for (const s of this.sides) {
      s.group.position.copy(s.base).setX(s.base.x + Math.sign(s.base.x) * e * SIDE_SPREAD);
      for (const [name, p] of Object.entries(s.parts)) {
        p.obj.position.copy(p.base).setX(p.base.x + p.out * e);
        if (name === "cushion" || name === "grille") {
          p.obj.position.y = p.base.y - focus * 1.6;
          p.obj.visible = focus < 0.98;
        }
      }
    }
  }

  /** The battery's glow (0..1) for the battery section. */
  setCharge(level: number): void { this.mats.battery.emissiveIntensity = level * 0.35; }

  update(t: number): void {
    // the drivers move with the music (or breathe gently when it's quiet)
    const push = this.drive > 0.01 ? this.drive * 0.035 : Math.sin(t * 2.2) * 0.002;
    for (const c of this.cones) c.position.x = (c.userData.x ??= c.position.x) - push;
    this.mats.led.color.copy(this.ledColour).multiplyScalar(0.75 + Math.sin(t * 2) * 0.25 + this.drive * 0.6);
  }

  private ledColour = new THREE.Color();
  /** Set the finish; `t` blends from the current colours (for a smooth change). */
  setColourway(c: Colourway, t = 1): void {
    const m = this.mats;
    m.shell.color.lerp(new THREE.Color(c.shell), t);
    m.metal.color.lerp(new THREE.Color(c.metal), t);
    m.cushion.color.lerp(new THREE.Color(c.cushion), t);
    m.cushion.sheenColor.lerp(new THREE.Color(c.cushion).offsetHSL(0, 0, 0.12), t);
    this.ledColour.lerp(new THREE.Color(c.led), t);
  }
}

/** Part of an ellipse in the xy plane: the headband's shape. */
class Arch extends THREE.Curve<THREE.Vector3> {
  private rx: number; private ry: number; private y0: number; private t0: number; private t1: number;
  constructor(rx: number, ry: number, y0: number, t0: number, t1: number) {
    super();
    this.rx = rx; this.ry = ry; this.y0 = y0; this.t0 = t0; this.t1 = t1;
  }
  getPoint(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    const t = this.t0 + (this.t1 - this.t0) * u;
    return target.set(Math.cos(t) * this.rx, this.y0 + Math.sin(t) * this.ry, 0);
  }
}

const smooth = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
