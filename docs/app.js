import { createReplayNetwork } from './modules/replay-network.js';
import { participant } from './modules/participants.js';
import { exampleReplaySteps } from './modules/example-replay.js';
import { replayInformationEvents, INFORMATION_LABELS } from './modules/replay-information.js';
const $ = (selector) => document.querySelector(selector);
const play = $('[data-replay-play]');
const next = $('[data-replay-next]');
const reset = $('[data-replay-reset]');
const progress = $('[data-replay-progress]');
const speed = $('[data-replay-speed]');
const feed = $('[data-replay-feed]');
const network = createReplayNetwork($('#replayNetwork'));
const graphPanel = $('#replayNetwork');
const conversationPanel = $('#conversationReplay');
function fitConversation() {
  if (!graphPanel.getClientRects().length) return;
  const sideBySide = matchMedia('(min-width: 1051px)').matches;
  const height = sideBySide ? Math.ceil(graphPanel.getBoundingClientRect().height) : 540;
  conversationPanel.style.setProperty('--simulation-panel-height', `${height}px`);
}
new ResizeObserver(fitConversation).observe(graphPanel);
window.addEventListener('resize', fitConversation);

let position = 0, timer, steps = [];
const sound = $('[data-replay-sound]');
sound.hidden = true;
$('#replaySoundStatus').textContent = 'Scripted example · Playback advances automatically. No audio.';
function pause() {
  clearInterval(timer); timer = undefined;
  play.textContent = position === steps.length ? 'Replay' : position ? 'Resume' : 'Play';
  $('[data-replay-status]').textContent = `${position} / ${steps.length} · Pause`;
}
function render() {
  const history = steps.slice(0, position);
  network.show(history.at(-1), history);
  network.updateAnxiety(steps, position);
  feed.replaceChildren();
  for (const step of history) {
    const person = participant(step.sender);
    const message = document.createElement('article');
    message.className = `replay-message participant-${person.color}${step.scope.id === 'dm' ? ' is-dm' : ''}${person.user ? ' is-user' : ''}`;
    message.dataset.person = step.sender;
    const avatar = document.createElement('div');
    avatar.className = 'participant-avatar'; avatar.textContent = person.icon; avatar.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('div'); meta.className = 'replay-meta';
    const name = document.createElement('strong'); name.textContent = person.label; meta.append(name);
    const route = document.createElement('span');
    route.textContent = `Step ${step.turn} / ${steps.length} · ${step.scope.label} → ${step.to === 'all' ? 'All agents' : participant(step.to).label} · ${step.title}`;
    meta.append(route);
    const bubble = document.createElement('p'); bubble.className = 'replay-bubble'; bubble.textContent = step.text;
    message.append(avatar, meta, bubble); feed.append(message);
  }
  feed.scrollTop = feed.scrollHeight;
  progress.value = position;
  progress.style.setProperty('--replay-progress', `${100 * position / steps.length}%`);
  $('[data-replay-position]').textContent = `${position} / ${steps.length}`;
  $('[data-replay-status]').textContent = `${position} / ${steps.length} · ${timer ? 'Playing' : 'Pause'}`;
  next.disabled = position === steps.length;
  if (position === steps.length && !timer) play.textContent = 'Replay';
}
function advance() {
  if (position < steps.length) position++;
  else if (timer) position = 0;
  render();
}
function start() {
  if (position === steps.length) position = 0;
  timer = setInterval(advance, 2800 / Number(speed.value));
  play.textContent = 'Pause'; advance();
}
document.addEventListener('demo-tab-change', event => {
  if (event.detail !== 'simulation' && steps.length) pause();
});
play.addEventListener('click', () => timer ? pause() : start());
next.addEventListener('click', () => { pause(); advance(); });
reset.addEventListener('click', () => { pause(); position = 0; render(); });
progress.addEventListener('input', () => { pause(); position = Number(progress.value); render(); });
speed.addEventListener('change', () => { if (timer) { clearInterval(timer); timer = setInterval(advance, 2800 / Number(speed.value)); } });
play.disabled = next.disabled = reset.disabled = true;
try {
  const response = await fetch('./examples/monitoring.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  steps = exampleReplaySteps(data.records);
  progress.max = steps.length; progress.disabled = false;
  const markers = $('[data-replay-markers]');
  markers.replaceChildren();
  const grouped = new Map();
  for (const event of replayInformationEvents(steps)) {
    if (!grouped.has(event.step)) grouped.set(event.step, []);
    grouped.get(event.step).push(event);
  }
  for (const [step, events] of grouped) {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'replay-progress-marker';
    marker.style.left = `${100 * step / steps.length}%`;
    const description = `Step ${step}: ${events.map(event => INFORMATION_LABELS[event.kind]).join(', ')} · ${participant(events[0].agent).label}`;
    marker.title = description;
    marker.setAttribute('aria-label', `Jump to ${description}`);
    for (const event of events) {
      const tick = document.createElement('span');
      tick.className = `replay-progress-tick information-${event.kind}`;
      tick.setAttribute('aria-hidden', 'true');
      marker.append(tick);
    }
    marker.addEventListener('click', () => { pause(); position = step; render(); });
    markers.append(marker);
  }
  play.disabled = next.disabled = reset.disabled = false;
  position = 0; render();
  // Begin when the visitor reaches the demo, rather than finishing above the fold.
  const observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) {
      observer.disconnect();
      if (!timer && position === 0) start();
    }
  }, { threshold: 0.15 });
  observer.observe($('#replayDashboard'));
  // A manual control takes precedence over pending autoplay.
  for (const control of [play, next, reset, progress, markers]) {
    control.addEventListener('pointerdown', () => observer.disconnect(), { once: true });
    control.addEventListener('keydown', () => observer.disconnect(), { once: true });
  }
} catch (error) {
  feed.textContent = 'Could not load the example. Run bash shells/serve.sh and reload.';
  console.error(error);
}
