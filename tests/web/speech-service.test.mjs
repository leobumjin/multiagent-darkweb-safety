import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {speechConfig,createSpeechService} from '../../web/speech-service.mjs';

test('ElevenLabs configuration loads the private env file with environment overrides',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'speech-config-'));
 try {
  await writeFile(join(dir,'.env'),'OPENAI_API_KEY=unrelated\nELEVENLABS_API_KEY="test-secret"\nELEVENLABS_VOICE_ID=voice123\n');
  assert.deepEqual(await speechConfig(join(dir,'.env'),{}),{apiKey:'test-secret',voiceId:'voice123',modelId:'eleven_multilingual_v2'});
  assert.equal((await speechConfig(join(dir,'.env'),{ELEVENLABS_VOICE_ID:'override'})).voiceId,'override');
  assert.equal((await speechConfig(join(dir,'missing'),{})).apiKey,'');
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('ElevenLabs sends Korean text to the configured voice and caches repeat playback',async()=>{
 const requests=[];
 const synthesize=createSpeechService({fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});}});
 const config={apiKey:'test-secret',voiceId:'voice123',modelId:'eleven_multilingual_v2'};
 const audio=await synthesize('\uc548\ub155\ud558\uc138\uc694.',config);
 assert.deepEqual([...audio],[1,2,3]);
 assert.equal(await synthesize('\uc548\ub155\ud558\uc138\uc694.',config),audio);
 assert.equal(requests.length,1);
 assert.match(requests[0].url,/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice123\?/);
 assert.equal(requests[0].options.headers['xi-api-key'],'test-secret');
 assert.equal(JSON.parse(requests[0].options.body).language_code,'ko');
 await synthesize('\uc548\ub155\ud558\uc138\uc694.',{...config,voiceId:'other'});
 assert.equal(requests.length,2);
 await assert.rejects(synthesize('x'.repeat(5001),config),{statusCode:400});
 await assert.rejects(synthesize('hello',{...config,apiKey:''}),{statusCode:503});
 await assert.rejects(synthesize('hello',{...config,voiceId:'../bad'}),{statusCode:400});
});

test('upstream errors are sanitized and unsuccessful responses are never cached',async()=>{
 let calls=0;
 const synthesize=createSpeechService({fetchImpl:async()=>{calls++;return new Response('sensitive upstream details',{status:401});}});
 const config={apiKey:'test-secret',voiceId:'voice123',modelId:'eleven_multilingual_v2'};
 for(let i=0;i<2;i++) await assert.rejects(synthesize('\uc548\ub155\ud558\uc138\uc694.',config),error=>error.statusCode===502 && /Check your API key/.test(error.message) && !error.message.includes('sensitive'));
 assert.equal(calls,2);
});

test('English and Korean narration are explicit and cached separately', async()=>{
 const requests=[];
 const synthesize=createSpeechService({fetchImpl:async(_url,options)=>{
  requests.push(JSON.parse(options.body)); return new Response(new Uint8Array([1]));
 }});
 const config={apiKey:'test-secret',voiceId:'voice123',modelId:'eleven_multilingual_v2'};
 await synthesize('same text',{...config,language:'en'});
 await synthesize('same text',{...config,language:'ko'});
 await synthesize('same text',{...config,language:'en'});
 assert.deepEqual(requests.map(r=>r.language_code),['en','ko']);
 await assert.rejects(synthesize('hello',{...config,language:'unsupported'}),{statusCode:400});
});
