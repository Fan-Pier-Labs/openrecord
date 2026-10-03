import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createHost } from './host';
import './styles.css';

const { host, receive } = createHost((msg) => window.parent.postMessage(msg, '*'));
window.addEventListener('message', (event) => {
  if (event.source === window.parent) receive(event.data);
});

// Tell the host our real height so the iframe stops scrolling.
void host.ready.then(() => {
  let lastHeight = 0;
  let frame = 0;
  const report = () => {
    frame = 0;
    const height = document.documentElement.scrollHeight;
    if (height === lastHeight) return;
    lastHeight = height;
    host.notify('ui/notifications/size-changed', { height });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(report);
  };
  schedule();
  new ResizeObserver(schedule).observe(document.documentElement);
}, () => {
  // App shows the failed handshake.
});

createRoot(document.getElementById('root')!).render(<App host={host} />);
