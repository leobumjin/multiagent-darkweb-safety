import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {mutateSavedResult, resolveResultPath, isArxived} from '../../web/result-storage.mjs';
import {resultExport} from '../../web/result-export.mjs';

async function fixture(t) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'run-storage-'));
  t.after(() => rm(projectRoot, {recursive:true, force:true}));
  const roots = ['results', 'arxived_results', 'custom-output'].map(name => join(projectRoot, name));
  await Promise.all(roots.map(root => mkdir(root)));
  async function save(folder, name='run', runId=name) {
    const dir = join(projectRoot, folder);
    await mkdir(dir, {recursive:true});
    const artifact = {run_id:runId, condition:{architecture:'multi'}, metrics:{}, decisions:[]};
    const path = join(dir, `${name}.json`);
    await writeFile(path, JSON.stringify(artifact));
    await writeFile(join(dir, `${name}.execution.json`), JSON.stringify({model:'recorded-model', created_at:'2026-10-01T00:00:00Z'}));
    await writeFile(join(dir, `${runId}.prompts.json`), JSON.stringify({prompt:'recorded prompt'}));
    await writeFile(join(dir, `${runId}.requests.jsonl`), JSON.stringify({input:'recorded request'})+'\n');
    return {path, artifact};
  }
  return {projectRoot, roots, save, mutate:(saved,action)=>mutateSavedResult({projectRoot,roots,saved,action}),
    resolve:path=>resolveResultPath(projectRoot,roots,Buffer.from(relative(projectRoot,path)).toString('base64url'))};
}

test('Arxiv moves the complete run bundle, preserves timestamps and keeps export reproducible', async t => {
  const f = await fixture(t), saved = await f.save('results/web/first');
  for (const [name, text] of [['summary.csv','run_id\nrun\n'], ['aggregate.json','[]'], ['execution.json','{"model":"recorded-model"}']]) await writeFile(join(dirname(saved.path),name),text);
  const before = await resultExport(saved), mtime = (await stat(saved.path)).mtimeMs;
  const moved = await f.mutate(saved, 'arxiv');
  assert.equal(relative(f.projectRoot,moved.path),'arxived_results/web/first/run.json');
  assert.equal(isArxived(f.projectRoot,moved.path),true);
  assert.deepEqual(await resultExport({...saved,path:moved.path}),before);
  assert.ok(Math.abs((await stat(moved.path)).mtimeMs-mtime)<2);
  assert.equal((await readdir(dirname(moved.path))).length,7);
  await assert.rejects(stat(dirname(saved.path)),{code:'ENOENT'});
  await assert.rejects(f.resolve(saved.path),{statusCode:404});
  assert.equal(await f.resolve(moved.path),moved.path);
  assert.deepEqual(await f.mutate({...saved,path:moved.path},'arxiv'),moved);
});

test('Delete removes the selected run in either location, including its sidecars', async t => {
  const f = await fixture(t);
  for (const folder of ['results/web/plain','arxived_results/web/archived']) {
    const saved = await f.save(folder);
    assert.deepEqual(await f.mutate(saved,'delete'),{path:null});
    await assert.rejects(stat(dirname(saved.path)),{code:'ENOENT'});
  }
  await assert.rejects(resolveResultPath(f.projectRoot,f.roots,Buffer.from('results').toString('base64url')),{statusCode:403});
});

test('interrupted filenames keep prompt and request records keyed by the actual run ID', async t => {
  const f = await fixture(t), saved = await f.save('results/web/interrupted','interrupted','actual-run');
  const moved = await f.mutate(saved,'arxiv');
  assert.deepEqual((await resultExport({...saved,path:moved.path})).metadata.requests,[{input:'recorded request'}]);
  await f.mutate({...saved,path:moved.path},'delete');
  await assert.rejects(stat(dirname(moved.path)),{code:'ENOENT'});
});

test('batch mutations preserve other runs, shared indexes and unrelated files', async t => {
  const f = await fixture(t), first = await f.save('results/batch','first'), second = await f.save('results/batch','second');
  await writeFile(join(dirname(first.path),'notes.txt'),'keep');
  await writeFile(join(dirname(first.path),'execution.json'),'{}');
  await writeFile(join(dirname(first.path),'summary.csv'),'original batch summary');
  const moved = await f.mutate(first,'arxiv');
  assert.equal((await resultExport({...first,path:moved.path})).metadata.execution.model,'recorded-model');
  assert.equal(await f.resolve(second.path),second.path);
  await f.mutate(second,'delete');
  assert.deepEqual((await readdir(dirname(first.path))).sort(),['execution.json','notes.txt','summary.csv']);
});

test('shared legacy manifest is copied per run and shared prompts survive a peer deletion', async t => {
  const f = await fixture(t), first = await f.save('results/batch','interrupted','same-run'), second = await f.save('results/batch','completed','same-run');
  await rm(join(dirname(first.path),'interrupted.execution.json'));
  await writeFile(join(dirname(first.path),'execution.json'),'{"model":"legacy-model"}');
  const moved = await f.mutate(first,'arxiv');
  assert.equal((await resultExport({...first,path:moved.path})).metadata.execution.model,'legacy-model');
  assert.equal((await resultExport(second)).metadata.prompt_snapshot.prompt,'recorded prompt');
  await f.mutate({...first,path:moved.path},'delete');
  assert.equal((await resultExport(second)).metadata.requests.length,1);
});

test('custom output paths are archived, and conflicting destinations leave both bundles untouched', async t => {
  const f = await fixture(t), custom = await f.save('custom-output/run-1');
  const moved = await f.mutate(custom,'arxiv');
  assert.equal(relative(f.projectRoot,moved.path),'arxived_results/custom-output/run-1/run.json');
  const source = await f.save('results/web/conflict'), existing = await f.save('arxived_results/web/conflict');
  await writeFile(existing.path,JSON.stringify({...existing.artifact,marker:'original archive'}));
  await assert.rejects(f.mutate(source,'arxiv'),{statusCode:409});
  assert.equal((await readdir(dirname(source.path))).length,4);
  assert.equal(JSON.parse(await readFile(existing.path,'utf8')).marker,'original archive');
});

test('path traversal, malformed IDs and source/destination symlinks cannot reach unrelated files', async t => {
  const f = await fixture(t), saved = await f.save('results/web/safe');
  await writeFile(join(f.projectRoot,'private.json'),'keep');
  for (const path of ['../private.json','results/../../private.json','private.json']) {
    await assert.rejects(resolveResultPath(f.projectRoot,f.roots,Buffer.from(path).toString('base64url')),{statusCode:403});
  }
  await assert.rejects(resolveResultPath(f.projectRoot,f.roots,'%%%'),{statusCode:400});
  await symlink(join(f.projectRoot,'private.json'),join(f.roots[0],'link.json'));
  await assert.rejects(f.resolve(join(f.roots[0],'link.json')),{statusCode:403});
  await symlink(dirname(saved.path),join(f.roots[1],'web'));
  await assert.rejects(f.mutate(saved,'arxiv'),{statusCode:403});
  await rm(join(dirname(saved.path),'run.prompts.json'));
  await symlink(join(f.projectRoot,'private.json'),join(dirname(saved.path),'run.prompts.json'));
  await assert.rejects(f.mutate(saved,'delete'),{statusCode:403});
  assert.equal(await readFile(join(f.projectRoot,'private.json'),'utf8'),'keep');
  assert.equal(await f.resolve(saved.path),saved.path);
});
