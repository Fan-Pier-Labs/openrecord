/**
 * Shared rendering helpers for the demo surfaces.
 *
 * Security note: model output is untrusted text. `renderMarkdown` escapes every
 * HTML-significant character *first* and only then applies a fixed whitelist of
 * markdown constructs. There is no raw-HTML passthrough anywhere in this file,
 * which is what keeps a prompt-injected `<img onerror=...>` from ever becoming
 * markup. Do not add a "just this once" bypass.
 */

/** Create an element with classes, attributes, text, and children in one call. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') throw new Error('el(): raw html is not allowed — build nodes instead');
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline markdown: bold, italic, and code. Input must already be escaped. */
function renderInline(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
}

/**
 * Render the markdown subset the assistant actually emits: `##` headings,
 * `-` bullets, `>` blockquotes, bold/italic/code, and the `[image:...]` token
 * the imaging tools use to place an attachment.
 *
 * Returns a DocumentFragment. Image tokens become `<figure data-image="...">`
 * placeholders the caller fills in — that indirection means a model can never
 * point the page at an arbitrary URL.
 */
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text ?? '').split('\n');

  let list = null;
  let quote = null;

  const flush = () => {
    if (list) {
      frag.append(list);
      list = null;
    }
    if (quote) {
      frag.append(quote);
      quote = null;
    }
  };

  const paragraphBuffer = [];
  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const p = document.createElement('p');
    p.innerHTML = renderInline(escapeHtml(paragraphBuffer.join('\n'))).replace(/\n/g, '<br>');
    frag.append(p);
    paragraphBuffer.length = 0;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    const imageMatch = line.match(/^\[image:([a-z0-9_-]+)\]$/i);
    if (imageMatch) {
      flushParagraph();
      flush();
      const figure = document.createElement('figure');
      figure.className = 'md-image';
      figure.dataset.image = imageMatch[1].toLowerCase();
      frag.append(figure);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flush();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flush();
      const h = document.createElement(`h${Math.min(6, heading[1].length + 2)}`);
      h.innerHTML = renderInline(escapeHtml(heading[2]));
      frag.append(h);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (quote) flush();
      if (!list) {
        list = document.createElement('ul');
      }
      const li = document.createElement('li');
      li.innerHTML = renderInline(escapeHtml(bullet[1]));
      list.append(li);
      continue;
    }

    const quoted = line.match(/^>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      if (list) flush();
      if (!quote) {
        quote = document.createElement('blockquote');
      }
      const p = document.createElement('p');
      p.innerHTML = renderInline(escapeHtml(quoted[1]));
      quote.append(p);
      continue;
    }

    if (list || quote) flush();
    paragraphBuffer.push(line);
  }

  flushParagraph();
  flush();
  return frag;
}

/**
 * Fill in `[image:...]` placeholders left by renderMarkdown.
 * Only `xray` is known; anything else is dropped rather than guessed at.
 */
export function hydrateImages(container) {
  for (const figure of container.querySelectorAll('figure.md-image')) {
    if (figure.dataset.image !== 'xray') {
      figure.remove();
      continue;
    }
    figure.append(renderSimulatedRadiograph());
    figure.append(
      el('figcaption', { text: 'Simulated radiograph — the real app decodes the portal\'s wavelet image format to JPEG.' })
    );
  }
}

/**
 * Draw a synthetic chest radiograph on a canvas.
 *
 * Deliberately generated rather than shipped as a file: a real radiograph in a
 * public marketing demo would be someone's medical image, and a stock one still
 * invites the question. This is obviously synthetic up close and labelled as
 * such, while still reading as an X-ray at a glance.
 */
export function renderSimulatedRadiograph(width = 300, height = 340) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.className = 'xray-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Simulated chest radiograph');

  const ctx = canvas.getContext('2d');
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
    const lung = ctx.createRadialGradient(cx + side * width * 0.19, height * 0.45, 4, cx + side * width * 0.19, height * 0.45, width * 0.2);
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

  // Posterior rib arcs. Clipped to each hemithorax so the pairs read as ribs
  // sweeping down and out, rather than as a lattice across the whole chest.
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
      // Each rib starts near the spine and arcs outward and downward.
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
    grain.data[i] = Math.max(0, Math.min(255, grain.data[i] + n));
    grain.data[i + 1] = Math.max(0, Math.min(255, grain.data[i + 1] + n));
    grain.data[i + 2] = Math.max(0, Math.min(255, grain.data[i + 2] + n));
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

  return canvas;
}

/**
 * The disclaimer shown under a reply the scripted engine produced. There are
 * two distinct reasons that happens and conflating them would be misleading:
 * a checkout with no endpoint configured never had a model, while a deployed
 * demo that falls back genuinely lost one.
 */
export function fallbackNote(hasLiveAi) {
  return hasLiveAi
    ? 'Answered offline — the demo model was unavailable or rate limited. The tool calls are real; the wording is pre-written.'
    : 'Answered by the offline engine — no model endpoint is configured. The tool calls and every number above are real; the wording is pre-written.';
}

/** Human-readable size of a tool result, for the activity panel. */
export function describeResult(result) {
  if (result && typeof result === 'object' && result.error) return { ok: false, label: 'error' };
  const size = JSON.stringify(result ?? null).length;
  if (Array.isArray(result)) return { ok: true, label: `${result.length} items · ${formatBytes(size)}` };
  if (result && typeof result === 'object') {
    for (const key of ['results', 'conversations', 'visits']) {
      if (Array.isArray(result[key])) return { ok: true, label: `${result[key].length} items · ${formatBytes(size)}` };
    }
    if (result.success) return { ok: true, label: `ok · ${formatBytes(size)}` };
  }
  return { ok: true, label: formatBytes(size) };
}

function formatBytes(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

/** Compact `key=value` preview of tool args for the activity log. */
export function summarizeArgs(args) {
  const entries = Object.entries(args ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => {
      const value = typeof v === 'string' && v.length > 28 ? `${v.slice(0, 28)}…` : v;
      return `${k}: ${value}`;
    })
    .join(' · ');
}

export function typeset(node, text) {
  clear(node);
  node.append(renderMarkdown(text));
  hydrateImages(node);
  return node;
}
