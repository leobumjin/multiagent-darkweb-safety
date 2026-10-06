import { messageScope, emailScope } from "./conversation-scope.js";
import { participant } from "./participants.js";
import { replayInformationEvents, INFORMATION_LABELS } from './replay-information.js';
import { explorationText } from './exploration-plan.js';
import { narrationText } from './replay-speech.js';
import { createReplayNarration } from './replay-narration.js';
export function replayMessages(event) {
  if (event.type === 'decision') {
    const d = event.decision || {};
    const messages = (d.messages || []).map((m, i) => ({id: `decision:${event.turn}:${event.agent}:${i}`, sender: event.agent, anxiety: m.anxiety ?? d.anxiety, to: (m.recipients || []).join(', ') || 'Recipients not recorded', text: m.content, phase: event.phase, turn: event.turn, kind: 'Message', scope: messageScope({...m, phase: event.phase})}));
    const plan = explorationText(d.exploration);
    if (plan) messages.unshift({id:`decision:${event.turn}:${event.agent}:exploration`,sender:event.agent,anxiety:d.anxiety,to:'',text:plan,phase:event.phase,turn:event.turn,kind:'Exploration plan',scope:{id:'plan',label:'Exploration plan · before execution'}});
    if (!messages.length && d.summary) messages.push({id: `decision:${event.turn}:${event.agent}:summary`, sender: event.agent, anxiety: d.anxiety, to: '', text: d.summary, phase: event.phase, turn: event.turn, kind: 'Activity summary', scope: {id:'summary',label:'Activity summary · not a delivered message'}});
    return messages.filter(m => m.text);
  }
  if (event.type === 'recruitment_tool') {
    const e = event.event;
    if (!e) return [];
    if (!['send_email', 'contact_candidate'].includes(e.call?.tool)) return accessMessages(event);
    const email = !e.blocked && e.data?.email;
    return [
      {id: `${e.event_id}:sent`, sender: e.agent, to: e.candidate_id, text: e.call.message, anxiety:e.call.anxiety, scope: emailScope(e), kind: e.blocked ? 'Blocked send request' : 'Contact request', turn: e.turn},
      {id: `${e.event_id}:response`, sender: email ? email.candidate_id || e.candidate_id : 'Contact tool', to: e.agent, text: email ? email.response : e.response, anxiety:email?.anxiety, anxietySource:email ? "simulated" : null, userOutcome: email ? {candidate:email.candidate_id || e.candidate_id,status:email.status} : null, scope: emailScope(e,true), kind: email ? `Candidate reply · ${email.status === 'approved' ? 'Approved' : email.status === 'refused' ? 'Refused' : 'Response'}` : 'Tool response', turn: e.turn},
    ].filter(m => m.text);
  }
  return accessMessages(event);
}
export function createReplay(root, onMessage = () => {}, onTimeline = () => {}, speech = createReplayNarration()) {
  const find = selector => root.querySelector(selector);
  const feed = find('[data-replay-feed]'), play = find('[data-replay-play]'), next = find('[data-replay-next]');
  const speed = find('[data-replay-speed]'), status = find('[data-replay-status]');
  const progress = find('[data-replay-progress]'), position = find('[data-replay-position]');
  const markers = find('[data-replay-markers]');
  const sound = find('[data-replay-sound]'), soundStatus = find('[data-replay-sound-status]');
  let queue = [], seen = new Set(), cursor = 0, timer = null, playing = false;
  let live = false, speaking = false, pendingNarration = false, generation = 0;
  let soundEnabled = speech.supported, speechError = '';
  let soundTouched = false;
  let markersDirty = true;
  function updateMarkers() {
    if (!markersDirty) return;
    markersDirty = false;
    markers.replaceChildren();
    const groups = new Map();
    for (const event of replayInformationEvents(queue)) {
      if (!groups.has(event.step)) groups.set(event.step,[]);
      groups.get(event.step).push(event);
    }
    for (const [step,events] of groups) {
      const mark = document.createElement('button');
      const details = events.map(event => `${INFORMATION_LABELS[event.kind]} · ${participant(event.agent).label}`).join(' / ');
      mark.type = 'button'; mark.className = 'replay-progress-marker';
      mark.style.left = `${step / queue.length * 100}%`;
      mark.title = `${step} / ${queue.length} · ${details}`;
      mark.setAttribute('aria-label', `${step}Jump to conversation · ${details}`);
      for (const event of events) {
        const line = document.createElement('span');
        line.className = `replay-progress-tick information-${event.kind}`;
        line.setAttribute('aria-hidden','true');
        mark.append(line);
      }
      mark.addEventListener('click', () => seek(step));
      markers.append(mark);
    }
  }
  function update() {
    onTimeline(queue,cursor);
    play.textContent = playing || speaking ? 'Pause' : pendingNarration ? 'Resume' : cursor && cursor === queue.length && !live ? 'Replay' : 'Play';
    play.disabled = !queue.length && !live;
    next.disabled = cursor >= queue.length;
    progress.disabled = !queue.length;
    progress.max = String(queue.length);
    progress.value = String(cursor);
    progress.setAttribute('aria-valuetext', `${cursor} / ${queue.length} conversations`);
    progress.style.setProperty('--replay-progress', `${queue.length ? cursor / queue.length * 100 : 0}%`);
    position.textContent = `${cursor} / ${queue.length}`;
    updateMarkers();
    const waiting = playing && live && cursor === queue.length && !speaking;
    const label = speaking ? 'Reading aloud' : waiting ? 'Waiting for next response' : playing ? 'Playing' : pendingNarration ? 'Pause' : cursor === queue.length && !live ? 'Playback complete' : 'Waiting';
    status.textContent = queue.length || live ? `${cursor} / ${queue.length} · ${label}` : 'Run an experiment or load a previous record.';
    sound.disabled = !speech.supported;
    sound.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    sound.setAttribute('aria-pressed', String(soundEnabled));
    sound.setAttribute('aria-label', soundEnabled ? 'Mute narration' : 'Enable narration');
    soundStatus.textContent = !speech.supported ? 'This browser does not support speech synthesis.'
      : speechError || (soundEnabled ? `${speech.label || 'Narration'} · Playback advances after narration finishes.` : 'Enable narration to read conversations aloud.');
    feed.setAttribute('aria-live', soundEnabled ? 'off' : 'polite');
  }
  function cancelPlayback() {
    generation++;
    clearTimeout(timer); timer = null;
    speech.cancel(); speaking = false;
  }
  function pause() { cancelPlayback(); playing = false; update(); }
  function messageRow(m) {
    const row = document.createElement('article');
    const person = participant(m.sender);
    row.className = `replay-message participant-${person.color}${person.user ? ' is-user' : ''}`;
    if (['dm', 'pair'].includes(m.scope.id)) row.classList.add('is-dm');
    const meta = document.createElement('div'); meta.className = 'replay-meta';
    const name = document.createElement('strong'); name.textContent = person.label;
    meta.append(name);
    if (m.scope.id.startsWith('email-') || m.sender === 'Contact tool' || m.scope.id === 'plan') {
      const delivery = document.createElement('span');
      delivery.className = `scope-badge scope-${m.scope.id}${m.kind === 'Blocked send request' ? ' is-blocked' : ''}`;
      delivery.textContent = m.kind === 'Blocked send request' ? 'Delivery blocked · not sent to candidate'
        : m.scope.id === 'email-reply' ? m.kind : m.scope.label;
      meta.append(delivery);
    }
    const bubble = document.createElement('p'); bubble.className = 'replay-bubble'; bubble.textContent = m.text;
    if (m.scope.id === 'plan') bubble.classList.add('replay-plan');
    const avatar = document.createElement('span'); avatar.className = 'participant-avatar'; avatar.textContent = person.icon;
    avatar.title = person.label;
    row.append(avatar, meta, bubble);
    return row;
  }
  function step() {
    if (cursor >= queue.length) { schedule(); return; }
    cancelPlayback(); pendingNarration = false;
    if (!cursor) feed.replaceChildren();
    const m = queue[cursor++];
    feed.append(messageRow(m));
    onMessage(m, queue.slice(0,cursor));
    feed.scrollTop = feed.scrollHeight;
    narrate();
  }
  function narrate() {
    const message = queue[cursor - 1];
    const ticket = generation;
    if (soundEnabled && message) {
      speaking = true; pendingNarration = true;
      const started = speech.speak(narrationText(message), speed.value, error => {
        if (ticket !== generation) return;
        speaking = false; pendingNarration = false;
        if (error) {
          soundEnabled = false;
          speechError = error === 'not-allowed'
            ? 'Audio was blocked. Enable narration to retry.'
            : speech.provider === 'elevenlabs' ? `${error} Enable narration to retry.`
              : 'Unable to play audio. Check the language voices on your device and enable narration.';
        }
        schedule(error ? undefined : 350 / Number(speed.value));
        update();
      });
      if (started) { update(); return; }
    }
    speaking = false; pendingNarration = false;
    schedule(); update();
  }
  function seek(value) {
    const target = Number(value);
    if (!Number.isFinite(target)) return;
    cancelPlayback(); playing = false; pendingNarration = false;
    cursor = Math.max(0, Math.min(queue.length, Math.floor(target)));
    const history = queue.slice(0,cursor);
    feed.replaceChildren(...history.map(messageRow));
    onMessage(history.at(-1) || null, history);
    feed.scrollTop = feed.scrollHeight;
    update();
  }
  function schedule(delay) {
    clearTimeout(timer); timer = null;
    if (!playing || speaking) return;
    if (cursor >= queue.length) {
      if (!live) playing = false;
      update(); return;
    }
    const length = queue[Math.max(0,cursor-1)]?.text.length || 0;
    timer = setTimeout(() => { timer = null; step(); }, delay ?? Math.min(9000, Math.max(2200, length * 30)) / Number(speed.value));
  }
  function start() {
    if (!queue.length && !live) return;
    if (!pendingNarration && cursor === queue.length && !live) { cursor = 0; feed.replaceChildren(); }
    playing = true;
    if (pendingNarration) narrate();
    else if (cursor < queue.length) step();
    else update();
  }
  play.addEventListener('click', () => {
    if (playing || speaking) { pause(); return; }
    start();
  });
  next.addEventListener('click', () => { pause(); step(); });
  progress.addEventListener('pointerdown', pause);
  progress.addEventListener('input', () => seek(progress.value));
  speed.addEventListener('change', () => {
    if (speaking) { cancelPlayback(); narrate(); }
    else schedule();
  });
  sound.addEventListener('click', () => {
    if (!speech.supported) return;
    soundTouched = true;
    const wasSpeaking = speaking;
    cancelPlayback(); pendingNarration = false;
    soundEnabled = !soundEnabled; speechError = '';
    if (soundEnabled && cursor && (playing || wasSpeaking)) narrate();
    else schedule();
    update();
  });
  find('[data-replay-reset]').addEventListener('click', () => seek(0));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  globalThis.addEventListener?.('pagehide', pause);
  speech.ready?.then(() => { if (!soundTouched && speech.provider === 'elevenlabs') soundEnabled = true; update(); });
  update();
  return {
    add(event) {
      const messages = replayMessages(event);
      if (messages.length) messages[messages.length-1].sourceEvent = event;
      for (const m of messages) if (!seen.has(m.id)) { seen.add(m.id); queue.push(m); markersDirty = true; }
      if (playing && !speaking && timer === null && cursor < queue.length) step();
      else update();
    },
    pause, seek,
    startLive() { live = true; start(); },
    setLive(value) { live = Boolean(value); if (!live && !speaking && timer === null) schedule(); update(); },
    reset() { live = false; queue = []; seen.clear(); markersDirty = true; seek(0); },
  };
}

function accessMessages(wrapper) {
 const e=wrapper.event || wrapper;
 if (!['observation','dark_tool','recruitment_tool'].includes(wrapper.type)) return [];
 const dark=wrapper.type==='dark_tool';
 if (!dark && !['P1','P2'].includes(e.level)) return [];
 const invalidRequest=e.page?.data?.failure_kind === 'invalid_request';
 const accessStatus=invalidRequest ? 'Request error' : e.blocked ? 'Blocked' : (e.success === false || e.executed === false) ? 'Failed' : 'Access';
 const category=dark ? 'Dark web' : e.level;
 const title=`${category} ${accessStatus}`;
 return [{id:`access:${e.event_id || wrapper.type+':'+e.turn+':'+e.agent}`,sender:e.agent,to:'',turn:e.turn,
   text:`${title} · ${e.tool || e.call?.tool || 'Search results'}\n${e.description || e.page?.text || e.response || ''}`,
   kind:'Access record',scope:{id:'tool',label:title},audit:{agent:e.agent,category,status:accessStatus,turn:e.turn}}];
}
