import { participant } from './participants.js';

export function narrationText(message) {
  const label = participant(message.sender).label;
  // Keep plans, blocked requests and tool records distinct from delivered speech.
  const kind = message.kind && message.kind !== 'Message' ? `${message.kind}. ` : '';
  return `${label}. ${kind}${message.text || ''}`;
}

export function speechChunks(text, limit = 180) {
  let remaining = String(text).replace(/\s+/g, ' ').trim();
  const chunks = [];
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const boundary = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    const end = boundary >= limit / 3 ? boundary + 1 : window.lastIndexOf(' ') + 1 || limit;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function createReplaySpeech({synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance} = {}) {
  const supported = Boolean(synthesis?.speak && synthesis?.cancel && Utterance);
  let generation = 0, active = null, watchdog = null;
  function cancel() {
    generation++;
    clearTimeout(watchdog);
    watchdog = null;
    const wasActive = active;
    active = null;
    if (wasActive) synthesis.cancel();
  }
  function speak(text, rate, onDone) {
    cancel();
    const chunks = speechChunks(text);
    if (!supported || !chunks.length) return false;
    const ticket = generation;
    const speed = Math.max(0.5, Math.min(2, Number(rate) || 1));
    let index = 0, finished = false;
    function finish(error = null) {
      if (ticket !== generation || finished) return;
      finished = true;
      clearTimeout(watchdog);
      watchdog = null;
      active = null;
      if (error) synthesis.cancel();
      onDone(error);
    }
    function next() {
      if (ticket !== generation || finished) return;
      if (index === chunks.length) { finish(); return; }
      try {
        const utterance = new Utterance(chunks[index++]);
        active = utterance; // Retain the utterance until its completion event.
        const language = /[\uac00-\ud7a3]/.test(text) ? "ko" : "en";
        const voices = (synthesis.getVoices?.() || []).filter(voice => new RegExp(`^${language}(?:[-_]|$)`, "i").test(voice.lang));
        const voice = voices.find(voice => voice.default) || voices.find(voice => voice.localService) || voices[0];
        utterance.lang = voice?.lang || (language === 'ko' ? 'ko-KR' : 'en-US');
        if (voice) utterance.voice = voice;
        utterance.rate = speed;
        utterance.onend = () => {
          if (ticket !== generation || active !== utterance || finished) return;
          clearTimeout(watchdog);
          active = null;
          next();
        };
        utterance.onerror = event => {
          if (active === utterance) finish(event.error || 'synthesis-failed');
        };
        // Some engines fail without an end/error event; release playback then.
        watchdog = setTimeout(() => finish('timeout'), Math.max(20000, utterance.text.length * 300 / speed + 5000));
        synthesis.speak(utterance);
      } catch {
        queueMicrotask(() => finish('synthesis-unavailable'));
      }
    }
    next();
    return true;
  }
  return {supported, speak, cancel};
}
