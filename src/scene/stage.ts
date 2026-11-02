import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { shadowTexture } from "./textures.ts";

/**
 * Renderer, studio lighting and the camera. The canvas is transparent: the page's own background (which changes
 * with the colourway) shows through, so the 3D sits in the page rather than in a box.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  readonly shadow: THREE.Mesh;
  private width = 1;
  private height = 1;
  /** Shift the picture sideways (or up on a phone) by this fraction of the screen, to make room for text. */
  shift = 0;
  /** On a phone: move the picture up by this fraction of the screen height. */
  lift = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Studio reflections from a generated room, so there's no HDR file to download
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const key = new THREE.DirectionalLight("#fff3e6", 2.2);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight("#bcd8ff", 2.4);
    rim.position.set(-4, 2, -4);
    this.scene.add(key, rim, new THREE.HemisphereLight("#ffffff", "#202024", 0.4));

    // A soft contact shadow under the product (cheaper than shadow maps, and nicer for a studio shot)
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -0.95;
    this.scene.add(this.shadow);
  }

  resize(w: number, h: number): void {
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 2 : 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // a phone gets a wider lens so the whole product still fits
    this.camera.fov = w / h < 0.8 ? 42 : 30;
    this.camera.updateProjectionMatrix();
  }

  get portrait(): boolean { return this.width / this.height < 0.8; }

  /** Point the camera: orbit `target` at a yaw and pitch (radians), `distance` away. */
  look(target: THREE.Vector3, yaw: number, pitch: number, distance: number): void {
    if (this.portrait) distance *= 1.18; // a narrow screen needs a little more room round the product
    const cp = Math.cos(pitch);
    this.camera.position.set(target.x + Math.sin(yaw) * cp * distance, target.y + Math.sin(pitch) * distance, target.z + Math.cos(yaw) * cp * distance);
    this.camera.lookAt(target);
    // shift the picture with a view offset rather than moving the camera, so the perspective doesn't change
    const w = this.width, h = this.height;
    if (this.portrait) this.camera.setViewOffset(w, h, 0, h * this.lift, w, h);
    else this.camera.setViewOffset(w, h, -this.shift * w, 0, w, h);
  }

  render(): void { this.renderer.render(this.scene, this.camera); }
}
