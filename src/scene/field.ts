import * as THREE from "three";

/**
 * The noise-cancelling picture: a wall of sound waves behind the headphones. Each line is a row of points the
 * vertex shader shakes with layered sine noise (the noise of a street, a train, an office). As `anc` goes from
 * 0 to 1 the waves near the head flatten out into calm, glowing lines, while the world further out stays loud.
 */
const LINES = 30, POINTS = 180, WIDTH = 13, Y0 = -1.1, Y1 = 2.4;

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAnc;
  attribute float aRow;
  varying float vCalm;
  varying float vEdge;
  varying float vRow;

  // layered sines: cheap, smooth, and different on every row
  float noise(float x, float row, float t) {
    return sin(x * 1.7 + t * 2.1 + row * 3.7) * 0.5
         + sin(x * 3.9 - t * 3.3 + row * 1.3) * 0.28
         + sin(x * 8.3 + t * 5.2 + row * 7.1) * 0.16
         + sin(x * 15.1 - t * 7.9 + row * 2.9) * 0.08;
  }

  void main() {
    vec3 p = position;
    // calm near the headphones (|x| < ~1.6) once noise cancelling is on; louder further out
    float near = 1.0 - smoothstep(1.4, 3.6, abs(p.x));
    float calm = uAnc * near;
    float amp = mix(0.16, 0.24, aRow) * (1.0 - calm * 0.97);
    p.y += noise(p.x, aRow * 10.0, uTime) * amp;
    vCalm = calm;
    vEdge = abs(p.x) / ${(WIDTH / 2).toFixed(1)};
    vRow = aRow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uNoise;
  uniform vec3 uCalm;
  uniform float uShow;
  varying float vCalm;
  varying float vEdge;
  varying float vRow;
  void main() {
    vec3 col = mix(uNoise, uCalm * 1.6, vCalm);
    // fade out at the ends of each line and towards the top and bottom rows
    float a = (1.0 - smoothstep(0.55, 1.0, vEdge)) * (0.35 + 0.65 * sin(vRow * 3.14159)) * mix(0.45, 0.9, vCalm);
    gl_FragColor = vec4(col, a * uShow);
  }
`;

export class WaveField {
  readonly mesh: THREE.LineSegments;
  private mat: THREE.ShaderMaterial;

  constructor() {
    const pos: number[] = [], row: number[] = [];
    for (let l = 0; l < LINES; l++) {
      const k = l / (LINES - 1), y = Y0 + (Y1 - Y0) * k;
      for (let i = 0; i < POINTS - 1; i++) {
        for (const j of [i, i + 1]) {
          pos.push(-WIDTH / 2 + (j / (POINTS - 1)) * WIDTH, y, 0);
          row.push(k);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aRow", new THREE.Float32BufferAttribute(row, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAnc: { value: 0 }, uShow: { value: 0 }, uNoise: { value: new THREE.Color("#ff7a5c") }, uCalm: { value: new THREE.Color("#8fd0ff") } }
    });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.position.z = -1.6;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  update(t: number, show: number, anc: number, calm: THREE.Color): void {
    this.mesh.visible = show > 0.01;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uShow.value = show;
    this.mat.uniforms.uAnc.value = anc;
    this.mat.uniforms.uCalm.value.copy(calm);
  }
}
