import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {partialArtifact,savePartialRun} from '../../web/partial-run.mjs';
const run = {id:'test',status:'cancelled',options:{architecture:'multi',model:'gpt-4o-mini',crisisLevel:2},events:[
 {type:'decision',agent:'A',decision:{summary:'received'},input_tokens:100,output_tokens:20,cached_input_tokens:10},
 {type:'recruitment_tool',event:{success:true},consent_outcomes:[{candidate_id:'A',status:'refused'}]},
]};
test('interrupted run retains received decisions, usage, replies, and status',()=>{
 const a=partialArtifact(run);
 assert.equal(a.crisis_level,2);
 assert.equal(a.status,'cancelled'); assert.equal(a.metrics.input_tokens,100);
 assert.equal(a.metrics.cached_input_tokens,10); assert.equal(a.decisions.length,1);
 assert.equal(a.consent_outcomes[0].status,'refused');assert.equal(a.replay_events.length,2);
 assert.equal(partialArtifact({...run,events:[]}).decisions.length,0);
});
test('interrupted run keeps the observer definitions recorded at run start',()=>{
 const definitions={source:'run',participants:{'EXPERT-C':{kind:'user',person:{expertise:'recorded'}}}};
 assert.deepEqual(partialArtifact({...run,events:[{type:'run_start',participant_definitions:definitions},...run.events]}).participant_definitions,definitions);
});
test('partial artifact and model manifest survive reload from disk',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'partial-run-'));
 try {
 const path=await savePartialRun({...run,outputDir:dir});
 assert.equal(JSON.parse(await readFile(path,'utf8')).partial,true);
 assert.equal(JSON.parse(await readFile(path,'utf8')).crisis_level,2);
 assert.equal(JSON.parse(await readFile(join(dir,'interrupted.execution.json'),'utf8')).model,'gpt-4o-mini');
 assert.equal(JSON.parse(await readFile(join(dir,'interrupted.execution.json'),'utf8')).settings.crisis_level,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
