import { useEffect, useRef } from 'react';

/**
 * A synthetic chest radiograph, drawn on a canvas.
 *
 * Deliberately generated rather than shipped as a file: a real radiograph in a
 * public marketing demo would be someone's medical image, and a stock one still
 * invites the question. This is obviously synthetic up close and labelled as
 * such, while still reading as an X-ray at a glance.
 */
export function Radiograph({ width = 300, height = 340 }: { width?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;

    // Soft-tissue envelope of the thorax.
    const body = ctx.createRadialGradient(cx, height * 0.5, width * 0.1, cx, height * 0.5, width * 0.62);
    body.addColorStop(0, 'rgba(150,160,175,0.55)');
    body.addColorStop(1, 'rgba(20,26,36,0)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, height * 0.52, width * 0.42, height * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lung fields — air is radiolucent, so they read darker than the tissue.
    for (const side of [-1, 1]) {
      const lung = ctx.createRadialGradient(
        cx + side * width * 0.19,
        height * 0.45,
        4,
        cx + side * width * 0.19,
        height * 0.45,
        width * 0.2,
      );
      lung.addColorStop(0, 'rgba(8,11,17,0.95)');
      lung.addColorStop(1, 'rgba(8,11,17,0.25)');
      ctx.fillStyle = lung;
      ctx.beginPath();
      ctx.ellipse(cx + side * width * 0.19, height * 0.45, width * 0.15, height * 0.26, side * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mediastinum and the enlarged cardiac silhouette the report describes.
    ctx.fillStyle = 'rgba(196,204,216,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - width * 0.02, height * 0.58, width * 0.14, height * 0.15, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(178,186,200,0.42)';
    ctx.fillRect(cx - width * 0.035, height * 0.2, width * 0.07, height * 0.42);

    // Posterior rib arcs, clipped to each hemithorax so the pairs read as ribs
    // sweeping down and out rather than as a lattice across the whole chest.
    ctx.lineWidth = 2.2;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(side < 0 ? 0 : cx + width * 0.035, height * 0.16, width * 0.465, height * 0.55);
      ctx.clip();
      for (let i = 0; i < 8; i++) {
        const y = height * (0.26 + i * 0.055);
        ctx.strokeStyle = `rgba(208,216,228,${0.34 - i * 0.03})`;
        ctx.beginPath();
        ctx.moveTo(cx + side * width * 0.04, y - height * 0.03);
        ctx.quadraticCurveTo(cx + side * width * 0.34, y - height * 0.02, cx + side * width * 0.4, y + height * 0.08);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Clavicles.
    ctx.strokeStyle = 'rgba(214,222,234,0.42)';
    ctx.lineWidth = 3.4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * width * 0.04, height * 0.2);
      ctx.quadraticCurveTo(cx + side * width * 0.2, height * 0.15, cx + side * width * 0.34, height * 0.21);
      ctx.stroke();
    }

    // Diaphragm domes.
    ctx.fillStyle = 'rgba(168,176,190,0.4)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + side * width * 0.19, height * 0.76, width * 0.17, height * 0.09, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // Film grain.
    const grain = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < grain.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 16;
      grain.data[i] = Math.max(0, Math.min(255, grain.data[i]! + n));
      grain.data[i + 1] = Math.max(0, Math.min(255, grain.data[i + 1]! + n));
      grain.data[i + 2] = Math.max(0, Math.min(255, grain.data[i + 2]! + n));
    }
    ctx.putImageData(grain, 0, 0);

    // Corner burn-in, the way a real viewer overlays study metadata.
    ctx.font = '600 9px ui-monospace, SFMono-Regular, monospace';
    ctx.fillStyle = 'rgba(180,196,220,0.75)';
    ctx.fillText('SIMPSON, HOMER J', 8, 16);
    ctx.fillText('CHEST PA/LAT', 8, 28);
    ctx.fillText('2025-09-14', 8, 40);
    ctx.fillStyle = 'rgba(255,170,120,0.9)';
    ctx.fillText('SIMULATED — NOT A REAL RADIOGRAPH', 8, height - 10);
  }, [width, height]);

  return (
    <canvas
      ref={ref}
      className="xray-canvas"
      style={{ width, height }}
      role="img"
      aria-label="Simulated chest radiograph"
    />
  );
}
