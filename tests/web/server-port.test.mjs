import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

// Bind the requested port first to reproduce EADDRINUSE without affecting other apps.
test('occupied port falls back to a free port and prints the actual working URL', {timeout:10000}, async t => {
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const requestedPort = occupied.address().port;
  let child;
  t.after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await new Promise(resolve => occupied.close(resolve));
  });
  child = spawn(process.execPath, ['web/server.mjs'], {
    env: {...process.env, HOST:'127.0.0.1', PORT:String(requestedPort)},
    stdio:['ignore','pipe','pipe'],
  });
  let output = '', errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Startup timed out: ${errors}`)), 5000);
    const finish = callback => value => { clearTimeout(timer); callback(value); };
    child.once('error', finish(reject));
    child.once('exit', finish(code => reject(new Error(`Server exited ${code}: ${errors}`))));
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) finish(resolve)(match[0]);
    });
  });
  assert.notEqual(Number(new URL(base).port), requestedPort);
  assert.match(output, /already in use; selecting an available port/);
  assert.equal(errors, '');
  assert.equal(occupied.listening, true);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok:true});
});
