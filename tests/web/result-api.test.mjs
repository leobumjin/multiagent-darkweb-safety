import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('saved-result API lists, restores, exports, archives and deletes in both storage locations', {timeout:15000}, async t => {
  const root = await mkdtemp(join(tmpdir(),'result-api-'));
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { child.once('exit',resolve); child.kill('SIGTERM'); });
    }
    await rm(root,{recursive:true,force:true});
  });
  await cp('web',join(root,'web'),{recursive:true});
  await mkdir(join(root,'shells'));
  await writeFile(join(root,'shells/env.sh'),'export BACKEND=mock\nexport API_MODEL=recorded-model\n');
  const dir = join(root,'results/web/api-fixture');
  await mkdir(dir,{recursive:true});
  const artifact = {run_id:'fixture',condition:{architecture:'multi',difficulty:'easy',attack:false},metrics:{api_calls:0},decisions:[],participant_definitions:{participants:{}}};
  await writeFile(join(dir,'fixture.json'),JSON.stringify(artifact));
  await writeFile(join(dir,'fixture.execution.json'),JSON.stringify({backend:'mock',model:'recorded-model',created_at:'2026-10-01T00:00:00Z'}));
  await writeFile(join(dir,'fixture.prompts.json'),'{"system":"saved prompt"}');
  await writeFile(join(dir,'fixture.requests.jsonl'),'{"request":"saved request"}\n');
  child = spawn(process.execPath,[join(root,'web/server.mjs')],{env:{...process.env,HOST:'127.0.0.1',PORT:'0'},stdio:['ignore','pipe','pipe']});
  const base = await new Promise((resolve,reject) => {
    let output='', errors='';
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});
    child.stderr.on('data',chunk=>{errors+=chunk;});
    child.once('error',reject);
    child.once('exit',code=>reject(new Error(`Server exited ${code}: ${errors}`)));
  });
  const request = async (path, options) => {
    const response = await fetch(base+path,options);
    return {status:response.status,body:await response.json()};
  };
  const listed = await request('/api/results');
  assert.equal(listed.status,200);
  assert.equal(listed.body.results.length,1);
  const initial = listed.body.results[0], route = `/api/results/${initial.id}`;
  assert.equal(initial.arxived,false);
  const exported = await request(route+'/export');
  assert.equal(exported.body.metadata.requests.length,1);
  assert.equal((await request(route+'/arxiv',{method:'POST',headers:{origin:'https://unrelated.example'}})).status,403);
  assert.equal((await request(route)).status,200);
  const archived = await request(route+'/arxiv',{method:'POST'});
  assert.equal(archived.status,200);
  const result = archived.body.result, archivedRoute = `/api/results/${result.id}`;
  assert.equal(result.arxived,true);
  assert.equal(result.relativePath,'arxived_results/web/api-fixture/fixture.json');
  assert.equal((await request(route)).status,404);
  assert.equal((await request('/api/results')).body.results.length,1);
  assert.deepEqual((await request(archivedRoute)).body.artifact,artifact);
  assert.deepEqual((await request(archivedRoute+'/export')).body,exported.body);
  assert.deepEqual((await request(result.artifactUrl)).body,artifact);
  assert.equal((await request(archivedRoute,{method:'DELETE'})).status,200);
  assert.equal((await request(archivedRoute)).status,404);
  assert.deepEqual((await request('/api/results')).body.results,[]);
  // A regular Results record can also be deleted directly.
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'fixture.json'),JSON.stringify(artifact));
  assert.equal((await request(route,{method:'DELETE'})).status,200);
  assert.deepEqual((await request('/api/results')).body.results,[]);
  assert.equal((await request('/api/results/'+Buffer.from('../outside.json').toString('base64url'),{method:'DELETE'})).status,403);
  assert.match(await readFile(join(root,'shells/env.sh'),'utf8'),/recorded-model/);
});
