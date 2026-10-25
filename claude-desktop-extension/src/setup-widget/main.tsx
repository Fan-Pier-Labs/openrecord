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

// Tell the host our real height so the iframe stops scrolling.
void host.ready.then(() => {
  let lastHeight = 0;
  let frame = 0;
  const report = () => {
    frame = 0;
    // Not scrollHeight: it rounds a fractional height down, leaving a
    // half-pixel to scroll, and never reports less than the current frame,
    // so the widget could not shrink.
    let bottom = document.documentElement.getBoundingClientRect().bottom;
    // The search results float (position: absolute), so the page's height leaves them out.
    for (const el of document.querySelectorAll('.results')) bottom = Math.max(bottom, el.getBoundingClientRect().bottom + 16);
    const height = Math.ceil(bottom + window.scrollY);
    if (height === lastHeight) return;
    lastHeight = height;
    host.notify('ui/notifications/size-changed', { height });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(report);
  };
  schedule();
  new ResizeObserver(schedule).observe(document.documentElement);
  // Opening the results list changes no element's size, only what is in the DOM.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
}, () => {
  // App shows the failed handshake.
});

createRoot(document.getElementById('root')!).render(<App host={host} />);
