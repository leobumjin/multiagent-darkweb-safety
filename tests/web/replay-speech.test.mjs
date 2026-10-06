import test from 'node:test';
import assert from 'node:assert/strict';
import {createReplaySpeech, narrationText, speechChunks} from '../../web/public/replay-speech.js';

function engine(voices = []) {
  const utterances = [];
  const synthesis = {getVoices:()=>voices, speak:utterance=>utterances.push(utterance), cancel(){this.cancellations++;}, cancellations:0};
  const speech = createReplaySpeech({synthesis, Utterance:class {constructor(text){this.text=text;}}});
  return {synthesis, utterances, speech};
}

test('narration identifies the speaker and does not present plans or blocked mail as dialogue',()=>{
  assert.equal(narrationText({sender:'SecurityExpert',kind:'Message',text:'I will check.'}),'Security expert. I will check.');
  assert.match(narrationText({sender:'EXPERT-C',kind:'Candidate reply · Refused',text:'Refused.'}),/^Medical AI operations Expert\. Candidate reply · Refused\./);
  assert.match(narrationText({sender:'CalmRecruiter',kind:'Blocked send request',text:'Please participate.'}),/Blocked send request/);
  assert.match(narrationText({sender:'CalmRecruiter',kind:'Exploration plan',text:'Check conditions'}),/Exploration plan/);
});

test('long Korean text is split without losing content and read sequentially',()=>{
  const text='First sentence. Read the next sentence completely. '.repeat(40).trim();
  const chunks=speechChunks(text);
  assert.ok(chunks.length>1);
  assert.ok(chunks.every(chunk=>chunk.length<=180));
  assert.equal(chunks.join(' '),text);
  assert.equal(speechChunks('x'.repeat(500)).join(''),'x'.repeat(500));
  assert.deepEqual(speechChunks('  \n '),[]);
  const {speech,utterances}=engine();
  const completions=[];
  try {
    speech.speak(text,1,error=>completions.push(error));
    for (let i=0;i<chunks.length;i++) {
      assert.equal(utterances.length,i+1);
      assert.equal(utterances[i].text,chunks[i]);
      assert.deepEqual(completions,[]);
      utterances[i].onend();
    }
    assert.deepEqual(completions,[null]);
  } finally {speech.cancel();}
});

test('selects a Korean voice from the current engine list and applies the chosen rate',()=>{
  const voices=[{lang:'en-US',default:true},{lang:'ko-KR',name:'remote'},{lang:'ko-KR',name:'local',localService:true}];
  const {speech,utterances}=engine(voices);
  try {
    speech.speak('\uc548\ub155\ud558\uc138\uc694',1.5,()=>{});
    assert.equal(utterances[0].voice.name,'local');
    assert.equal(utterances[0].lang,'ko-KR');
    assert.equal(utterances[0].rate,1.5);
    voices.push({lang:'ko-KR',name:'late default',default:true});
    speech.speak('\uc548\ub155\ud558\uc138\uc694',2,()=>{});
    assert.equal(utterances[1].voice.name,'late default');
    voices.length=0;
    speech.speak('\uc548\ub155\ud558\uc138\uc694',0.5,()=>{});
    assert.equal(utterances[2].voice,undefined);
    assert.equal(utterances[2].lang,'ko-KR');
  } finally {speech.cancel();}
});

test('cancel ignores late completion/error events and prevents remaining chunks from speaking',()=>{
  const {speech,utterances,synthesis}=engine();
  const completions=[];
  speech.speak('\uc548\ub155\ud558\uc138\uc694. '.repeat(100),1,error=>completions.push(error));
  const old=utterances[0];
  speech.cancel();
  old.onend();old.onerror({error:'interrupted'});
  assert.equal(utterances.length,1);
  assert.deepEqual(completions,[]);
  assert.equal(synthesis.cancellations,1);
  speech.speak('New message.',1,error=>completions.push(error));
  old.onend();old.onerror({error:'canceled'});
  assert.deepEqual(completions,[]);
  utterances[1].onend();
  assert.deepEqual(completions,[null]);
});

test('engine failures and missing events finish once instead of stalling the replay',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {speech,utterances}=engine();
  const errors=[];
  speech.speak('Speech error',1,error=>errors.push(error));
  utterances[0].onerror({error:'not-allowed'});
  utterances[0].onend();
  t.mock.timers.tick(120000);
  assert.deepEqual(errors,['not-allowed']);
  speech.speak('Response None',1,error=>errors.push(error));
  t.mock.timers.tick(20000);
  utterances[1].onend();
  assert.deepEqual(errors,['not-allowed','timeout']);
});

test('missing support and thrown synthesis calls fail safely',async()=>{
  const unavailable=createReplaySpeech({synthesis:null,Utterance:null});
  assert.equal(unavailable.supported,false);
  assert.equal(unavailable.speak('\uc548\ub155\ud558\uc138\uc694',1,()=>assert.fail('No speech should start')),false);
  unavailable.cancel();
  const {speech,synthesis}=engine();
  synthesis.speak=()=>{throw new Error('engine unavailable');};
  const error=await new Promise(resolve=>speech.speak('\uc548\ub155\ud558\uc138\uc694',1,resolve));
  assert.equal(error,'synthesis-unavailable');
  speech.cancel();
});

test('English content selects an English voice and fallback language',()=>{
 const voices=[{lang:'ko-KR',default:true},{lang:'en-US',name:'English',localService:true}];
 const {speech,utterances}=engine(voices);
 try {
  speech.speak('Hello world.',1,()=>{});
  assert.equal(utterances[0].voice.name,'English');
  assert.equal(utterances[0].lang,'en-US');
  voices.length=0;
  speech.speak('No voice installed.',1,()=>{});
  assert.equal(utterances[1].lang,'en-US');
 } finally {speech.cancel();}
});
