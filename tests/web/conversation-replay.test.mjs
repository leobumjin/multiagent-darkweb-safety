import test from 'node:test';
import assert from 'node:assert/strict';
import { replayMessages, createReplay } from '../../web/public/conversation-replay.js';
const event = {type:'decision',turn:1,agent:'CalmRecruiter',phase:'dm',decision:{summary:'summary',messages:[{recipients:['SecurityExpert'],content:'first'},{recipients:['CrisisLead'],content:'second'}]}};
class Element {
 constructor(){this.children=[];this.handlers={};this.value='1';this.classList={add(){}};this.style={setProperty(){}};}
 addEventListener(name,fn){this.handlers[name]=fn;}
 setAttribute(name,value){this[name]=value;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
}
function withReplay(check, speech) {
 const elements=new Map();const root={querySelector(s){if(!elements.has(s))elements.set(s,new Element());return elements.get(s);}};
 const originalDocument=globalThis.document;
 const documentHandlers={};
 globalThis.document={createElement:()=>new Element(),addEventListener(name,fn){documentHandlers[name]=fn;}};
 let replay;
 try {
  const messages=[],timelines=[];
  replay=createReplay(root,(message,history)=>messages.push({message,history}),(queue,cursor)=>timelines.push({queue,cursor}),speech);
  check({replay,get:name=>root.querySelector(`[data-replay-${name}]`),messages,timelines,documentHandlers});
 } finally {replay?.pause();globalThis.document=originalDocument;}
}
test('replays actual messages individually, preserving recipients and phase',()=>{
 const messages=replayMessages(event);
 assert.deepEqual(messages.map(m=>m.text),['first','second']);
 assert.equal(messages[0].to,'SecurityExpert');assert.equal(messages[0].phase,'dm');
 assert.equal(replayMessages({type:'decision',decision:{summary:'activity'}})[0].kind,'Activity summary');
});

function fakeSpeech() {
 const calls=[];
 return {supported:true,calls,cancellations:0,
  speak(text,rate,done){calls.push({text,rate,done});return true;},
  cancel(){this.cancellations++;},
 };
}

test('speech finishes before advancing and the final utterance is not cut off',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const speech=fakeSpeech();
 withReplay(({replay,get})=>{
  replay.add(event);
  get('play').handlers.click();
  assert.equal(speech.calls.length,1);
  assert.match(speech.calls[0].text,/Calm recruiter\. first/);
  t.mock.timers.tick(30000);
  assert.equal(get('position').textContent,'1 / 2');
  speech.calls[0].done();
  t.mock.timers.tick(350);
  assert.equal(get('position').textContent,'2 / 2');
  assert.equal(speech.calls.length,2);
  assert.equal(get('play').textContent,'Pause');
  assert.match(get('status').textContent,/Reading aloud/);
  speech.calls[1].done();
  assert.equal(get('play').textContent,'Replay');
  assert.match(get('status').textContent,/Playback complete/);
 },speech);
});

test('pausing resumes the interrupted message; seek and reset reject stale speech callbacks',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const speech=fakeSpeech();
 withReplay(({replay,get})=>{
  replay.add(event);get('play').handlers.click();
  const interrupted=speech.calls[0];
  get('play').handlers.click();
  assert.equal(get('play').textContent,'Resume');
  interrupted.done();t.mock.timers.tick(30000);
  assert.equal(get('position').textContent,'1 / 2');
  get('play').handlers.click();
  assert.equal(speech.calls[1].text,interrupted.text);
  assert.equal(get('feed').children.length,1);
  replay.seek(0);
  speech.calls[1].done();t.mock.timers.tick(30000);
  assert.equal(get('position').textContent,'0 / 2');
  get('next').handlers.click();
  assert.equal(get('play').textContent,'Pause');
  replay.reset();speech.calls.at(-1).done();t.mock.timers.tick(30000);
  assert.equal(get('position').textContent,'0 / 0');
  assert.equal(get('feed').children.length,0);
 },speech);
});

test('live playback waits between streamed responses and stays paused when new events arrive',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const speech=fakeSpeech();
 const single={...event,decision:{messages:[{content:'Live response'}]}};
 withReplay(({replay,get})=>{
  replay.startLive();
  assert.equal(get('play').disabled,false);
  assert.match(get('status').textContent,/Waiting for next response/);
  replay.add(single);
  assert.equal(speech.calls.length,1);
  speech.calls[0].done();
  assert.equal(get('play').textContent,'Pause');
  assert.match(get('status').textContent,/Waiting for next response/);
  replay.add({...single,turn:2});
  assert.equal(speech.calls.length,2);
  replay.pause();
  replay.add({...single,turn:3});
  speech.calls[1].done();t.mock.timers.tick(30000);
  assert.equal(speech.calls.length,2);
  get('play').handlers.click();
  assert.equal(speech.calls.length,3);
  speech.calls[2].done();t.mock.timers.tick(350);
  assert.equal(speech.calls.length,4);
  replay.setLive(false);
  assert.match(get('status').textContent,/Reading aloud/);
  speech.calls[3].done();
  assert.match(get('status').textContent,/Playback complete/);
 },speech);
});

test('speed changes restart the current speech, mute continues silently and backgrounding cancels',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const speech=fakeSpeech();
 withReplay(({replay,get,documentHandlers})=>{
  replay.add(event);get('play').handlers.click();
  get('speed').value='2';get('speed').handlers.change();
  assert.equal(speech.calls.length,2);
  assert.equal(speech.calls[1].rate,'2');
  assert.equal(speech.calls[1].text,speech.calls[0].text);
  get('sound').handlers.click();
  assert.equal(get('sound')['aria-pressed'],'false');
  assert.equal(get('feed')['aria-live'],'polite');
  speech.calls[1].done();t.mock.timers.tick(1100);
  assert.equal(get('position').textContent,'2 / 2');
  assert.equal(speech.calls.length,2);
  get('sound').handlers.click();get('play').handlers.click();
  const cancellations=speech.cancellations;
  globalThis.document.hidden=true;documentHandlers.visibilitychange();
  assert.equal(speech.cancellations,cancellations+1);
  assert.equal(get('play').textContent,'Resume');
 },speech);
});

test('speech errors show recovery instructions and fall back to timed text playback',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const speech=fakeSpeech();
 withReplay(({replay,get})=>{
  replay.add(event);get('play').handlers.click();
  speech.calls[0].done('not-allowed');
  assert.equal(get('sound')['aria-pressed'],'false');
  assert.match(get('sound-status').textContent,/Enable narration/);
  t.mock.timers.tick(2200);
  assert.equal(get('position').textContent,'2 / 2');
  assert.equal(speech.calls.length,1);
  get('sound').handlers.click();get('play').handlers.click();
  assert.equal(speech.calls.length,2);
 },speech);
 withReplay(({get})=>{
  assert.equal(get('sound').disabled,true);
  assert.match(get('sound-status').textContent,/does not support/);
 },{supported:false,cancel(){}});
});
test('exploration is visible before tools without becoming a sent message, approval or access event',()=>{
 const planned={type:'decision',turn:9,agent:'ImpatientRecruiter',phase:'execution',decision:{summary:'Review new methods',messages:[],exploration:{obstacle:'Previous request refused',ideas:['Check public conditions','Ask teammate'],next_action:'Search public conditions',why_this:'Verify new evidence',change:'Search instead of repeating the email'}}};
 const [plan]=replayMessages(planned);
 assert.equal(plan.kind,'Exploration plan');
 assert.equal(plan.scope.id,'plan');
 assert.equal(plan.to,'');
 assert.equal(plan.userOutcome,undefined);
 assert.equal(plan.audit,undefined);
 assert.match(plan.text,/1\. Check public conditions/);
 assert.match(plan.text,/What changed · Search instead of repeating the email/);
 withReplay(({replay,get})=>{
  replay.add(planned);replay.add(planned);
  assert.equal(get('progress').max,'1');
  replay.seek(1);
  assert.equal(get('feed').children[0].children[1].children[1].textContent,'Exploration plan · before execution');
  assert.equal(get('feed').children[0].children[2].textContent,plan.text);
  assert.equal(get('markers').children.length,0);
 });
 assert.equal(replayMessages({...planned,decision:{summary:'Previous log',exploration:null}})[0].kind,'Activity summary');
});
test('blocked email and tool response are labelled rather than impersonating candidate',()=>{
 const messages=replayMessages({type:'recruitment_tool',event:{event_id:'e',blocked:true,agent:'A',candidate_id:'B',call:{tool:'send_email',message:'request'},response:'blocked'}});
 assert.equal(messages[0].kind,'Blocked send request');assert.equal(messages[1].sender,'Contact tool');
});
test('replay visibly distinguishes blocked delivery from a real user reply',()=>{
 withReplay(({replay,get})=>{
  replay.add({type:'recruitment_tool',event:{event_id:'blocked',blocked:true,agent:'CalmRecruiter',candidate_id:'EXPERT-A',call:{tool:'send_email',message:'request'},response:'private contact required'}});
  replay.add({type:'recruitment_tool',event:{event_id:'delivered',agent:'CalmRecruiter',candidate_id:'EXPERT-A',call:{tool:'send_email',message:'request'},data:{email:{candidate_id:'EXPERT-A',response:'Approved',status:'approved'}}}});
  replay.seek(4);
  const rows=get('feed').children;
  assert.equal(rows[0].children[1].children[1].textContent,'Delivery blocked · not sent to candidate');
  assert.equal(rows[1].children[1].children[0].textContent,'Contact tool');
  assert.equal(rows[3].children[1].children[1].textContent,'Candidate reply · Approved');
  assert.equal(rows[3].children[2].textContent,'Approved');
 });
});
test('playback steps, deduplicates, pauses and resets without leaving timers',()=>{
 withReplay(({replay,get})=>{
  replay.add(event);replay.add(event);
  assert.match(get('status').textContent,/0 \/ 2/);
  get('play').handlers.click();assert.equal(get('feed').children.filter(n=>n.className?.startsWith('replay-message')).length,1);
  get('play').handlers.click();assert.equal(get('play').textContent,'Play');
  get('next').handlers.click();assert.equal(get('feed').children.filter(n=>n.className?.startsWith('replay-message')).length,2);
  assert.equal(get('next').disabled,true);
  replay.reset();assert.equal(get('feed').children.length,0);assert.equal(get('play').disabled,true);
 });
});

test('slider seeks both ways and restores only the messages and audit history at that point',()=>{
 withReplay(({replay,get,messages,timelines})=>{
  assert.equal(get('progress').disabled,true);
  replay.add(event);
  replay.add({type:'observation',event:{event_id:'access',agent:'CalmRecruiter',turn:2,level:'P2',description:'recorded access'}});
  assert.equal(get('progress').max,'3');
  get('progress').value='3';get('progress').handlers.input();
  assert.equal(get('feed').children.length,3);
  assert.equal(messages.at(-1).message.audit.category,'P2');
  assert.equal(get('next').disabled,true);
  get('progress').value='1';get('progress').handlers.input();
  assert.equal(get('feed').children.length,1);
  assert.deepEqual(messages.at(-1).history.map(m=>m.text),['first']);
  assert.equal(messages.at(-1).message.text,'first');
  assert.equal(timelines.at(-1).cursor,1);
  assert.equal(get('progress')['aria-valuetext'],'1 / 3 conversations');
  assert.equal(get('position').textContent,'1 / 3');
  get('next').handlers.click();
  assert.equal(messages.at(-1).message.text,'second');
  assert.equal(get('progress').value,'2');
  get('reset').handlers.click();
  assert.equal(get('feed').children.length,0);
  assert.equal(messages.at(-1).message,null);
  assert.deepEqual(messages.at(-1).history,[]);
  assert.equal(get('progress').value,'0');
  assert.equal(get('progress').disabled,false);
  replay.reset();
  assert.equal(get('progress').disabled,true);
  assert.equal(get('progress').max,'0');
  assert.equal(get('position').textContent,'0 / 0');
 });
});

test('seeking pauses playback, resumes from the selected point, and tracks newly added messages',()=>{
 withReplay(({replay,get,messages})=>{
  replay.add(event);
  get('play').handlers.click();
  assert.equal(get('play').textContent,'Pause');
  get('progress').handlers.pointerdown();
  assert.equal(get('play').textContent,'Play');
  get('progress').value='0';get('progress').handlers.input();
  get('play').handlers.click();
  assert.equal(messages.at(-1).message.text,'first');
  replay.seek(1);
  assert.equal(get('play').textContent,'Play');
  replay.add({...event,turn:3});
  assert.equal(get('progress').max,'4');
  assert.equal(get('progress').value,'1');
  get('play').handlers.click();
  assert.equal(messages.at(-1).message.text,'second');
  replay.seek(999);
  assert.equal(get('position').textContent,'4 / 4');
  assert.equal(get('next').disabled,true);
  replay.seek(-1);
  assert.equal(get('position').textContent,'0 / 4');
});
});

test('progress markers seek to the source event, stay visible when rewinding and clear on reset',()=>{
 withReplay(({replay,get,messages})=>{
  replay.add(event);
  replay.add({type:'observation',event:{event_id:'marked',turn:2,agent:'CalmRecruiter',kind:'query_result',executed:true,source_id:'p2:one',level:'P2',description:'source'}});
  const markers=get('markers');
  assert.equal(markers.children.length,1);
  const mark=markers.children[0];
  assert.match(mark['aria-label'],/3Jump to conversation · Confidential access/);
  assert.equal(mark.style.left,'100%');
  mark.handlers.click();
  assert.equal(get('progress').value,'3');
  assert.equal(messages.at(-1).message.sourceEvent.event.event_id,'marked');
  replay.seek(0);
  assert.equal(markers.children[0],mark);
  replay.add({...event,turn:4});
  assert.equal(markers.children[0].style.left,'60%');
  replay.reset();
  assert.equal(markers.children.length,0);
 });
});

test('actual candidate email replies are attributed to their numbered user',()=>{
 const messages=replayMessages({type:'recruitment_tool',event:{event_id:'e2',agent:'A',candidate_id:'EXPERT-C',call:{tool:'send_email',message:'request'},response:'wrapper',data:{email:{candidate_id:'EXPERT-C',response:'Refused',status:'refused'}}}});
 assert.equal(messages[1].sender,'EXPERT-C');assert.equal(messages[1].text,'Refused');assert.match(messages[1].kind,/Refused/);
});

test('access records replay independently of conversations and do not infer access from mentions',()=>{
 const observed=replayMessages({type:'observation',event:{event_id:'o',agent:'A',level:'P1',description:'result',turn:1}});
 assert.equal(observed[0].audit.category,'P1');
 const blocked=replayMessages({type:'dark_tool',event:{event_id:'d',agent:'A',blocked:true,success:false,page:{text:'denied'}}});
 assert.equal(blocked[0].audit.status,'Blocked');
 assert.equal(replayMessages({type:'decision',decision:{summary:'P2 access is forbidden'}})[0].audit,undefined);
});

test('anxiety follows the current speaker, preserving zero and missing legacy values',()=>{
 const messages=replayMessages({type:'decision',agent:'SecurityExpert',decision:{anxiety:50,messages:[{content:'a',anxiety:0},{content:'b',anxiety:99}]}});
 assert.deepEqual(messages.map(m=>m.anxiety),[0,99]);
 assert.equal(replayMessages({type:'decision',decision:{summary:'legacy'}})[0].anxiety,undefined);
 const reply=replayMessages({type:'recruitment_tool',event:{event_id:'e',agent:'A',candidate_id:'EXPERT-A',call:{tool:'send_email',message:'invite',anxiety:20},data:{email:{candidate_id:'EXPERT-A',response:'yes',status:'approved',anxiety:15}}}});
 assert.equal(reply[1].anxiety,15);assert.equal(reply[1].anxietySource,'simulated');
});
