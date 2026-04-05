#!/usr/bin/env bun
/**
 * Generate fake Homer Simpson skull X-ray CLO images.
 *
 * Creates two views:
 * 1. SKULL AP (front view) - skull outline with crayons visible inside
 * 2. SKULL LATERAL (side view) - skull profile with crayons visible
 *
 * Uses the CLO encoder from scrapers/myChart/clo-to-jpg-converter/generate_clo.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import {
  encodePixelFile,
  encodeWrapperFile,
} from "../scrapers/myChart/clo-to-jpg-converter/generate_clo";

const W = 512;
const H = 512;

// X-ray style values (bones bright, soft tissue dark, background black)
const BG = 0;
const SOFT_TISSUE = 8000;
const BONE = 45000;
const BONE_BRIGHT = 55000;
const CRAYON = 60000;
const TEETH = 50000;

// ─── Drawing helpers ─────────────────────────────────────────────

function fillEllipse(
  img: Uint16Array,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  value: number,
  blend = false,
) {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const idx = y * W + x;
        if (blend) {
          img[idx] = Math.min(65535, img[idx] + value);
        } else {
          img[idx] = value;
        }
      }
    }
  }
}

function fillEllipseRing(
  img: Uint16Array,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  thickness: number,
  value: number,
) {
  const innerRx = rx - thickness;
  const innerRy = ry - thickness;
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const dxi = (x - cx) / innerRx;
      const dyi = (y - cy) / innerRy;
      if (dx * dx + dy * dy <= 1 && dxi * dxi + dyi * dyi > 1) {
        img[y * W + x] = value;
      }
    }
  }
}

function fillRect(
  img: Uint16Array,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
) {
  for (let r = Math.max(0, Math.floor(y)); r < Math.min(H, Math.ceil(y + h)); r++) {
    for (let c = Math.max(0, Math.floor(x)); c < Math.min(W, Math.ceil(x + w)); c++) {
      img[r * W + c] = value;
    }
  }
}

/** Draw a rotated rectangle (crayon shape) */
function fillRotatedRect(
  img: Uint16Array,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  angle: number,
  value: number,
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const maxR = Math.ceil(Math.sqrt(halfW * halfW + halfH * halfH));

  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      // Rotate back to local coords
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfH) {
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (px >= 0 && px < W && py >= 0 && py < H) {
          img[py * W + px] = value;
        }
      }
    }
  }
}

/** Draw a crayon with pointed tip */
function drawCrayon(
  img: Uint16Array,
  cx: number,
  cy: number,
  length: number,
  width: number,
  angle: number,
  brightness: number,
) {
  // Main body
  fillRotatedRect(img, cx, cy, length / 2, width / 2, angle, brightness);

  // Pointed tip
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tipCx = cx + cos * (length / 2 + width * 0.3);
  const tipCy = cy + sin * (length / 2 + width * 0.3);
  fillRotatedRect(img, tipCx, tipCy, width * 0.4, width * 0.3, angle, brightness);
}

// ─── Skull AP (front view) ───────────────────────────────────────

function generateSkullAP(): Uint16Array {
  const img = new Uint16Array(W * H);

  // Background: slight noise for X-ray feel
  for (let i = 0; i < W * H; i++) {
    img[i] = BG + Math.floor(Math.random() * 1500);
  }

  // Cranium (outer skull bone) - large oval
  fillEllipseRing(img, 256, 220, 155, 190, 18, BONE);

  // Inner skull area (brain - softer tissue)
  fillEllipse(img, 256, 220, 137, 172, SOFT_TISSUE);

  // Frontal sinus (slightly brighter area at top)
  fillEllipse(img, 256, 80, 50, 25, BONE * 0.6);

  // Eye sockets (dark ovals)
  fillEllipse(img, 195, 240, 42, 38, BG + 2000);
  fillEllipse(img, 317, 240, 42, 38, BG + 2000);

  // Eye socket rims (bone)
  fillEllipseRing(img, 195, 240, 45, 40, 5, BONE_BRIGHT);
  fillEllipseRing(img, 317, 240, 45, 40, 5, BONE_BRIGHT);

  // Nasal cavity (dark triangle-ish area)
  fillEllipse(img, 256, 305, 20, 35, BG + 3000);
  // Nasal bone
  fillRect(img, 250, 270, 12, 30, BONE);

  // Zygomatic arches (cheekbones)
  fillEllipse(img, 155, 280, 30, 15, BONE * 0.8);
  fillEllipse(img, 357, 280, 30, 15, BONE * 0.8);

  // Maxilla (upper jaw)
  fillEllipseRing(img, 256, 350, 70, 30, 8, BONE);

  // Mandible (lower jaw)
  fillEllipseRing(img, 256, 385, 80, 40, 10, BONE);

  // Teeth (row of bright spots)
  for (let i = 0; i < 10; i++) {
    const tx = 210 + i * 9;
    fillRect(img, tx, 345, 7, 14, TEETH);
  }
  // Lower teeth
  for (let i = 0; i < 10; i++) {
    const tx = 210 + i * 9;
    fillRect(img, tx, 365, 7, 14, TEETH);
  }

  // Cervical spine (vertebrae below skull)
  for (let i = 0; i < 4; i++) {
    fillEllipse(img, 256, 430 + i * 22, 18, 10, BONE);
  }

  // === THE CRAYONS! ===
  // 5 crayons stuck in Homer's brain at various angles

  // Red crayon (top-left, angled down-right)
  drawCrayon(img, 200, 160, 70, 10, 0.5, CRAYON);

  // Blue crayon (upper-right, angled left)
  drawCrayon(img, 310, 150, 65, 9, -0.7, CRAYON - 5000);

  // Green crayon (center, nearly vertical)
  drawCrayon(img, 260, 180, 75, 10, -0.15, CRAYON - 2000);

  // Yellow crayon (left side, steep angle)
  drawCrayon(img, 190, 200, 60, 9, 1.2, CRAYON - 8000);

  // Purple crayon (right side, horizontal-ish)
  drawCrayon(img, 300, 195, 55, 8, 0.3, CRAYON - 3000);

  return img;
}

// ─── Skull Lateral (side view) ───────────────────────────────────

function generateSkullLateral(): Uint16Array {
  const img = new Uint16Array(W * H);

  // Background noise
  for (let i = 0; i < W * H; i++) {
    img[i] = BG + Math.floor(Math.random() * 1500);
  }

  // Cranium (side view - larger oval, shifted slightly)
  fillEllipseRing(img, 240, 210, 170, 185, 16, BONE);
  fillEllipse(img, 240, 210, 154, 169, SOFT_TISSUE);

  // Frontal bone (thicker at front)
  fillEllipseRing(img, 240, 210, 170, 185, 24, BONE * 0.7);

  // Facial bones (front/bottom)
  // Orbital (eye socket from side)
  fillEllipse(img, 340, 235, 35, 32, BG + 2000);
  fillEllipseRing(img, 340, 235, 38, 35, 5, BONE_BRIGHT);

  // Nasal bone
  fillRect(img, 370, 250, 8, 40, BONE);

  // Maxilla
  fillEllipse(img, 345, 320, 55, 25, BONE * 0.7);

  // Mandible (jaw from side - curved)
  for (let t = 0; t < Math.PI; t += 0.01) {
    const mx = 310 + 70 * Math.cos(t);
    const my = 360 + 50 * Math.sin(t);
    if (mx >= 0 && mx < W && my >= 0 && my < H) {
      for (let d = -6; d <= 6; d++) {
        const px = Math.round(mx);
        const py = Math.round(my + d);
        if (py >= 0 && py < H && px >= 0 && px < W) {
          img[py * W + px] = BONE;
        }
      }
    }
  }

  // Teeth (side view)
  for (let i = 0; i < 6; i++) {
    fillRect(img, 335 + i * 8, 330, 6, 16, TEETH);
  }

  // Cervical spine
  for (let i = 0; i < 5; i++) {
    fillEllipse(img, 175, 420 + i * 20, 22, 9, BONE);
  }

  // Temporal bone area
  fillEllipse(img, 180, 270, 20, 40, BONE * 0.5);

  // Ear region
  fillEllipse(img, 150, 260, 12, 18, BONE * 0.4);

  // === THE CRAYONS (side view, tips pointing into skull) ===

  // Crayon 1 - entered from top, angled down
  drawCrayon(img, 250, 150, 75, 10, 0.2, CRAYON);

  // Crayon 2 - near the front, angled back
  drawCrayon(img, 290, 170, 65, 9, -0.6, CRAYON - 5000);

  // Crayon 3 - in the middle, nearly horizontal
  drawCrayon(img, 240, 200, 70, 10, 0.05, CRAYON - 2000);

  // Crayon 4 - lower, angled up
  drawCrayon(img, 230, 240, 55, 9, -0.4, CRAYON - 8000);

  // Crayon 5 - near the back
  drawCrayon(img, 200, 180, 60, 8, 0.8, CRAYON - 3000);

  return img;
}

// ─── Main ────────────────────────────────────────────────────────

const outputDir = join(import.meta.dir, "../fake-mychart/src/data/clo-images");

const metadata = {
  photometricInterpretation: "MONOCHROME2",
  bitsStored: 16,
  windowCenter: 30000,
  windowWidth: 60000,
};

// Generate SKULL AP
console.log("Generating SKULL AP (front view with crayons)...");
const apPixels = generateSkullAP();
const apPixelClo = encodePixelFile(apPixels, W, H);
const apWrapperClo = encodeWrapperFile(metadata);
writeFileSync(join(outputDir, "skull_ap_pixel.clo"), apPixelClo);
writeFileSync(join(outputDir, "skull_ap_wrapper.clo"), apWrapperClo);
console.log(`  skull_ap_pixel.clo: ${(apPixelClo.length / 1024).toFixed(0)} KB`);
console.log(`  skull_ap_wrapper.clo: ${(apWrapperClo.length / 1024).toFixed(0)} KB`);

// Generate SKULL LATERAL
console.log("Generating SKULL LATERAL (side view with crayons)...");
const latPixels = generateSkullLateral();
const latPixelClo = encodePixelFile(latPixels, W, H);
const latWrapperClo = encodeWrapperFile(metadata);
writeFileSync(join(outputDir, "skull_lateral_pixel.clo"), latPixelClo);
writeFileSync(join(outputDir, "skull_lateral_wrapper.clo"), latWrapperClo);
console.log(`  skull_lateral_pixel.clo: ${(latPixelClo.length / 1024).toFixed(0)} KB`);
console.log(`  skull_lateral_wrapper.clo: ${(latWrapperClo.length / 1024).toFixed(0)} KB`);

console.log("\nDone! Homer's crayons-in-skull X-rays generated.");
