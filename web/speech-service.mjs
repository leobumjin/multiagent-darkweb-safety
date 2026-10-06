import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export async function speechConfig(envPath, environment = process.env) {
  const source = await readFile(envPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?(ELEVENLABS_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
  }
  const value = key => (environment[key] ?? values[key] ?? '').trim();
  return {apiKey:value('ELEVENLABS_API_KEY'), voiceId:value('ELEVENLABS_VOICE_ID'), modelId:value('ELEVENLABS_MODEL_ID') || 'eleven_multilingual_v2'};
}

function failure(statusCode, message) { return Object.assign(new Error(message), {statusCode}); }

export function createSpeechService({fetchImpl = fetch} = {}) {
  const cache = new Map();
  let cacheBytes = 0;
  return async function synthesize(text, config) {
    const language = config.language || (/[\uac00-\ud7a3]/.test(text) ? "ko" : "en");
    if (!["en", "ko"].includes(language)) throw failure(400, "language must be en or ko.");
    if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw failure(400, 'Speech text must contain 1–5,000 characters.');
    if (!config.apiKey || !config.voiceId) throw failure(503, 'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.');
    if (!/^[a-zA-Z0-9_-]+$/.test(config.voiceId)) throw failure(400, 'Invalid ElevenLabs voice ID.');
    const key = createHash('sha256').update(JSON.stringify([config.apiKey, config.voiceId, config.modelId, language, text])).digest('hex');
    if (cache.has(key)) return cache.get(key);
    let response;
    try {
      response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}?output_format=mp3_44100_128`, {
        method:'POST', headers:{'xi-api-key':config.apiKey, 'Content-Type':'application/json', Accept:'audio/mpeg'},
        body:JSON.stringify({text, model_id:config.modelId, language_code:language, voice_settings:{stability:0.5, similarity_boost:0.75, style:0.15, use_speaker_boost:true}}),
        signal:AbortSignal.timeout(60000),
      });
    } catch { throw failure(502, 'ElevenLabs Connection failed. Try again shortly.'); }
    if (!response.ok) {
      const message = response.status === 401 ? 'Check your API key for ElevenLabs.'
        : response.status === 403 ? 'ElevenLabs Check speech generation permissions and access to the selected voice.'
        : response.status === 402 || response.status === 429 ? 'ElevenLabs Check your usage limit or credits.'
        : response.status === 404 ? 'The selected ElevenLabs voice was not found.' : 'ElevenLabs Speech generation failed.';
      throw failure(502, message);
    }
    let audio;
    try { audio = Buffer.from(await response.arrayBuffer()); }
    catch { throw failure(502, 'ElevenLabs Unable to download audio.'); }
    if (!audio.length) throw failure(502, 'ElevenLabs returned empty audio.');
    // Bound memory usage while avoiding repeat charges on replay and rate changes.
    if (audio.length <= 20 * 1024 * 1024) {
      while (cache.size >= 32 || cacheBytes + audio.length > 20 * 1024 * 1024) {
        const oldest = cache.keys().next().value;
        cacheBytes -= cache.get(oldest).length; cache.delete(oldest);
      }
      cache.set(key, audio); cacheBytes += audio.length;
    }
    return audio;
  };
}
