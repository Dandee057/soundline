import * as THREE from "three";

/**
 * Small geometry helpers for building the headphones in code: no model files to download, and every part is a
 * separate mesh that can fly apart for the exploded view.
 */

/** A point on a superellipse ("squircle"): n = 2 is an ellipse, higher n gets squarer with rounded corners. */
export function squircle(a: number, b: number, n: number, t: number): [number, number] {
  const c = Math.cos(t), s = Math.sin(t);
  return [a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)];
}

/**
 * Sweep a rounded cross-section along a curve that lies in the xy plane (the headband). The section's first axis
 * runs along the curve's in-plane normal (thickness), the second along z (width).
 */
export function sweepXY(
  curve: THREE.Curve<THREE.Vector3>,
  section: { thickness: number; width: number; roundness?: number },
  steps = 96,
  ring = 24
): THREE.BufferGeometry {
  const n = section.roundness ?? 4;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, p = curve.getPointAt(u);
    curve.getTangentAt(u, tangent);
    normal.crossVectors(z, tangent).normalize(); // in-plane, perpendicular to the curve
    for (let j = 0; j <= ring; j++) {
      const [a, b] = squircle(section.thickness / 2, section.width / 2, n, (j / ring) * Math.PI * 2);
      positions.push(p.x + normal.x * a, p.y + normal.y * a, p.z + b);
      uvs.push(u, j / ring);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j, b = a + ring + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  capEnds(g, steps, ring);
  g.computeVertexNormals();
  return g;
}

/** Close both ends of a swept tube with a fan, so the band doesn't look hollow when it lifts off. */
function capEnds(g: THREE.BufferGeometry, steps: number, ring: number): void {
  const pos = g.getAttribute("position") as THREE.Float32BufferAttribute;
  const p = Array.from(pos.array as Float32Array), uv = Array.from((g.getAttribute("uv") as THREE.Float32BufferAttribute).array as Float32Array);
  const idx = Array.from(g.getIndex()!.array);
  for (const [start, flip] of [[0, true], [steps * (ring + 1), false]] as const) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < ring; j++) { cx += p[(start + j) * 3]; cy += p[(start + j) * 3 + 1]; cz += p[(start + j) * 3 + 2]; }
    const centre = p.length / 3;
    p.push(cx / ring, cy / ring, cz / ring); uv.push(0.5, 0.5);
    for (let j = 0; j < ring; j++) {
      const a = start + j, b = start + j + 1;
      if (flip) idx.push(centre, b, a); else idx.push(centre, a, b);
    }
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
}

/**
 * A lathe whose axis points along +x (an ear cup faces sideways). `profile` is [radius, x] pairs, outside first.
 */
export function latheX(profile: [number, number][], segments = 72): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x)), segments);
  g.rotateZ(-Math.PI / 2); // lathe axis y → x (LatheGeometry's own normals are kept: recomputing them would show the seam)
  return g;
}

/** A closed outline with rounded corners between the given points (for lathe profiles), `r` the corner radius. */
export function roundedOutline(points: [number, number][], r: number, perCorner = 6): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n], p = points[i], next = points[(i + 1) % n];
    const d1 = norm([prev[0] - p[0], prev[1] - p[1]]), d2 = norm([next[0] - p[0], next[1] - p[1]]);
    const a: [number, number] = [p[0] + d1[0] * r, p[1] + d1[1] * r], b: [number, number] = [p[0] + d2[0] * r, p[1] + d2[1] * r];
    for (let k = 0; k <= perCorner; k++) {
      // quadratic Bézier from a to b with the corner as its control point
      const t = k / perCorner, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * p[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p[1] + t * t * b[1]]);
    }
  }
  out.push(out[0]);
  return out;
}
const norm = ([x, y]: [number, number]): [number, number] => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

/** A box with rounded edges (battery, chips). */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 4): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const bevel = Math.min(r, d / 2) * 0.6;
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: seg, curveSegments: seg * 2 });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  g.computeVertexNormals();
  return g;
}
