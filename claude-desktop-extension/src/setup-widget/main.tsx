// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createHost, type HostContext } from './host';
import './styles.css';

// Claude Desktop sends its theme, color variables and font faces; styles.css
// falls back to Claude's palette for any it leaves out.
const hostFonts = document.createElement('style');
document.head.appendChild(hostFonts);
const applyHostContext = ({ theme, styles }: HostContext) => {
  const root = document.documentElement;
  if (theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }
  for (const [name, value] of Object.entries(styles?.variables ?? {})) {
    if (value) root.style.setProperty(name, value);
  }
  if (styles?.css?.fonts) hostFonts.textContent = styles.css.fonts;
};

const { host, receive } = createHost((msg) => window.parent.postMessage(msg, '*'), applyHostContext);
window.addEventListener('message', (event) => {
  if (event.source === window.parent) receive(event.data);
});

// Measure the content, not documentElement.scrollHeight: that is never less
// than the iframe itself, so once the host grew the frame it could never shrink.
const contentHeight = () => {
  let bottom = document.body.getBoundingClientRect().bottom;
  // The search results float (position: absolute), so body's height leaves them out.
  for (const el of document.querySelectorAll('.results')) bottom = Math.max(bottom, el.getBoundingClientRect().bottom + 16);
  return Math.ceil(bottom + window.scrollY);
};

// Tell the host our real height so the iframe stops scrolling.
void host.ready.then(() => {
  let lastHeight = 0;
  let frame = 0;
  const report = () => {
    frame = 0;
    const height = contentHeight();
    if (height === lastHeight) return;
    lastHeight = height;
    host.notify('ui/notifications/size-changed', { height });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(report);
  };
  schedule();
  new ResizeObserver(schedule).observe(document.body);
  // Opening the results list changes no element's size, only what is in the DOM.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
}, () => {
  // App shows the failed handshake.
});

createRoot(document.getElementById('root')!).render(<App host={host} />);
