import * as THREE from "three";

/** Textures drawn on a canvas at start-up, so the page has no image files to wait for. */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The speaker grille: a hex-hole mesh, used as an alpha map (white = solid). */
export function grilleTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#000";
    const r = 7, dx = r * 2.1, dy = r * 1.82;
    for (let row = 0, y = 0; y < 530; row++, y += dy) {
      for (let x = row % 2 ? dx / 2 : 0; x < 530; x += dx) {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82); }
        g.fill();
      }
    }
  }, false);
}

/** The circuit board: dark green with gold traces and pads. */
export function pcbTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = "#0f2a1f"; g.fillRect(0, 0, 512, 512);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = "#c9a54a"; g.lineCap = "round";
    for (let i = 0; i < 70; i++) {
      // traces run in straight lines with 45° bends, like a real board
      let x = rand() * 512, y = rand() * 512;
      g.lineWidth = 1.5 + rand() * 2.5; g.globalAlpha = 0.55 + rand() * 0.4;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        const len = 30 + rand() * 90, dir = Math.floor(rand() * 8) * (Math.PI / 4);
        x += Math.cos(dir) * len; y += Math.sin(dir) * len; g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1; g.fillStyle = "#e3c262"; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
  });
}

/** The battery's label. */
export function batteryTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 320, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 320); grd.addColorStop(0, "#1e2329"); grd.addColorStop(1, "#2c333b");
    g.fillStyle = grd; g.fillRect(0, 0, 512, 320);
    g.fillStyle = "#e8edf2"; g.font = "600 44px Manrope, system-ui, sans-serif"; g.fillText("SOUNDLINE", 36, 92);
    g.fillStyle = "#8b96a3"; g.font = "500 26px Manrope, system-ui, sans-serif";
    g.fillText("Li-ion 3.85 V  ·  1200 mAh", 36, 150); g.fillText("60 h playback  ·  ANC on", 36, 190);
    g.strokeStyle = "#5bd1a0"; g.lineWidth = 5; g.strokeRect(36, 230, 140, 46); g.fillStyle = "#5bd1a0"; g.fillRect(44, 238, 100, 30); g.fillRect(178, 244, 8, 18);
  });
}

/** A soft round shadow for under the product. */
export function shadowTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(0,0,0,0.55)"); grd.addColorStop(0.5, "rgba(0,0,0,0.22)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  });
}
