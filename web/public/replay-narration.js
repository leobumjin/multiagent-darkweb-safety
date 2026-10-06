import {createReplaySpeech, speechChunks} from './replay-speech.js';

export function createReplayNarration() {
  const browser = createReplaySpeech();
  if (!globalThis.Audio || !globalThis.fetch) return browser;
  let provider = 'browser', generation = 0, controller = null, audio = null, objectUrl = null, endAudio = null;
  const ready = fetch('/api/speech/config').then(response => response.ok ? response.json() : {})
    .then(config => { provider = config.provider === 'elevenlabs' ? 'elevenlabs' : 'browser'; }).catch(() => {});
  function cancel() {
    generation++;
    controller?.abort(); controller = null;
    browser.cancel();
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    endAudio?.(); endAudio = null;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }
  function speak(text, rate, done) {
    cancel();
    const ticket = generation;
    async function run() {
      await ready;
      if (ticket !== generation) return;
      if (provider !== 'elevenlabs') {
        if (!browser.speak(text, rate, done)) done('synthesis-unavailable');
        return;
      }
      // Larger chunks retain natural intonation while respecting request limits.
      const chunks = speechChunks(text, 4500);
      for (const chunk of chunks) {
        controller = new AbortController();
        const response = await fetch('/api/speech', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text:chunk, language: /[\uac00-\ud7a3]/.test(chunk) ? "ko" : "en"}), signal:AbortSignal.any([controller.signal, AbortSignal.timeout(75000)])});
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'ElevenLabs Speech generation failed.');
        }
        const blob = await response.blob();
        if (ticket !== generation) return;
        objectUrl = URL.createObjectURL(blob);
        audio = new Audio(objectUrl);
        audio.playbackRate = Math.max(0.5, Math.min(2, Number(rate) || 1));
        audio.preservesPitch = true;
        await new Promise((resolve, reject) => {
          endAudio = resolve;
          audio.onended = resolve;
          audio.onerror = () => reject(new Error('ElevenLabs Unable to play audio.'));
          audio.play().catch(reject);
        });
        if (ticket !== generation) return;
        endAudio = null;
        URL.revokeObjectURL(objectUrl); objectUrl = null; audio = null;
      }
      if (ticket === generation) done(null);
    }
    run().catch(error => {
      if (ticket !== generation) return;
      cancel();
      done(error.name === 'NotAllowedError' ? 'not-allowed' : error.message || 'ElevenLabs Connection failed.');
    });
    return true;
  }
  return {get supported(){return provider === 'elevenlabs' || browser.supported;}, get label(){return provider === 'elevenlabs' ? 'ElevenLabs Narration' : 'Narration';}, get provider(){return provider;}, ready, speak, cancel};
}
