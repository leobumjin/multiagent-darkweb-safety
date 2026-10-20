const frame = document.getElementById('timeline');
let records = [], ready = false, started = false, visible = false;
const visibility = new IntersectionObserver(entries => {
  visible = entries.some(entry => entry.isIntersecting);
}, { threshold: 0.1 });
visibility.observe(frame);
function send() {
  if (!ready || !records.length) return;
  frame.contentWindow.postMessage({ type: 'sensitive-timeline', run: 'Synthetic example · invented anxiety and events', records }, location.origin);
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'sensitive-timeline-ready') return;
  ready = true; send();
  // Fit the embedded document instead of adding a second vertical scrollbar.
  const resize = () => {
    if (!frame.getClientRects().length) return;
    const page = frame.contentDocument.querySelector('.page');
    if (page) frame.style.height = `${Math.ceil(page.getBoundingClientRect().height) + 2}px`;
  };
  const contentObserver = new ResizeObserver(resize);
  contentObserver.observe(frame.contentDocument.querySelector('.page'));
  resize();
});
try {
  const response = await fetch('./examples/monitoring.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  ({ records } = await response.json());
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    for (const event of ['pointerdown', 'keydown']) {
      doc.addEventListener(event, () => { started = true; }, { once: true });
    }
  });
  send();
  setInterval(() => {
    if (!ready) return;
    const button = frame.contentDocument?.getElementById('play');
    if (visible && !started && button && !button.disabled) { started = true; button.click(); }
  }, 200);
} catch (error) { console.error('Could not load the synthetic monitoring example:', error); }

document.addEventListener('demo-tab-change', event => {
  if (event.detail === 'monitoring' || !ready) return;
  const scrub = frame.contentDocument?.getElementById('scrub');
  if (scrub) scrub.dispatchEvent(new Event('input', { bubbles: true }));
});
