import {constants} from 'node:fs';
import {copyFile, lstat, mkdir, readFile, readdir, rmdir, unlink, utimes} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';

const inside = (root, path) => path.startsWith(root + sep);
const fail = (statusCode, message) => { throw Object.assign(new Error(message), {statusCode}); };
const locks = new Set();

// Reject symlinks in every component, including configured roots and destination parents.
async function safePath(projectRoot, path, allowMissing = false) {
  if (!inside(projectRoot, path)) fail(403, 'Invalid result path.');
  let current = projectRoot;
  for (const part of relative(projectRoot, path).split(sep)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) fail(403, 'Results linked through symbolic links cannot be changed.');
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) return;
      if (error.code === 'ENOENT') fail(404, 'Saved result not found. Refresh the list.');
      throw error;
    }
  }
}

export async function resolveResultPath(projectRoot, roots, id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(400, 'Invalid saved result ID.');
  const decoded = Buffer.from(id, 'base64url').toString('utf8');
  if (!decoded || decoded.includes('\0') || Buffer.from(decoded).toString('base64url') !== id) fail(400, 'Invalid saved result ID.');
  const path = resolve(projectRoot, decoded);
  if (!path.endsWith('.json') || !roots.some(root => inside(root, path))) fail(403, 'Invalid result path.');
  await safePath(projectRoot, path);
  return path;
}

export const isArxived = (projectRoot, path) => inside(join(projectRoot, 'arxived_results'), path);

async function bundle(projectRoot, roots, saved) {
  const path = await resolveResultPath(projectRoot, roots, Buffer.from(relative(projectRoot, saved.path)).toString('base64url'));
  const dir = dirname(path), stem = basename(path, '.json'), runId = saved.artifact.run_id;
  if (typeof runId !== 'string' || !runId || basename(runId) !== runId || ['.', '..'].includes(runId)) fail(400, 'Invalid run ID.');
  const entries = await readdir(dir, {withFileTypes:true});
  const peers = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === basename(path)) continue;
    try {
      const artifact = JSON.parse(await readFile(join(dir, entry.name), 'utf8'));
      if (artifact.run_id && artifact.condition && artifact.metrics && Array.isArray(artifact.decisions)) peers.push(artifact);
    } catch { /* Not a run artifact. */ }
  }
  const sharedPrompts = peers.some(peer => peer.run_id === runId);
  const ownNames = new Set([basename(path), `${stem}.execution.json`, `${runId}.prompts.json`, `${runId}.requests.jsonl`]);
  const sharedNames = new Set(['execution.json', 'aggregate.json', 'summary.csv']);
  // Shared batch indexes stay with the other runs. A standalone run includes its indexes.
  const standalone = !peers.length && entries.every(entry => entry.isFile() && (ownNames.has(entry.name) || sharedNames.has(entry.name)));
  const files = [];
  for (const entry of entries) {
    if (!ownNames.has(entry.name) && !(standalone && sharedNames.has(entry.name))) continue;
    const source = join(dir, entry.name);
    await safePath(projectRoot, source);
    if (!entry.isFile()) fail(409, 'The result contains a non-file entry.');
    const shared = sharedPrompts && [`${runId}.prompts.json`, `${runId}.requests.jsonl`].includes(entry.name);
    files.push({source, name:entry.name, remove:!shared});
  }
  // Legacy batches may only have a shared manifest; retain it as a per-run sidecar.
  if (!files.some(file => file.name === `${stem}.execution.json` || file.name === 'execution.json') && entries.some(entry => entry.name === 'execution.json')) {
    const source = join(dir, 'execution.json');
    await safePath(projectRoot, source);
    if (!(await lstat(source)).isFile()) fail(409, 'Invalid execution settings file.');
    files.push({source, name:`${stem}.execution.json`, remove:false});
  }
  return {path, dir, files};
}

async function removeEmptyDirectory(dir, roots) {
  if (roots.includes(dir)) return;
  try { await rmdir(dir); } catch (error) {
    if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes(error.code)) throw error;
  }
}

export async function mutateSavedResult({projectRoot, roots, saved, action}) {
  if (!['arxiv', 'delete'].includes(action)) fail(400, 'Unsupported result operation.');
  const lock = dirname(saved.path);
  if (locks.has(lock)) fail(409, 'This result folder is busy. Try again shortly.');
  locks.add(lock);
  try {
    const {path, dir, files} = await bundle(projectRoot, roots, saved);
    if (action === 'delete') {
      for (const file of files) if (file.remove) await unlink(file.source);
      await removeEmptyDirectory(dir, roots);
      return {path:null};
    }
    if (isArxived(projectRoot, path)) return {path};
    const resultsRoot = join(projectRoot, 'results'), archiveRoot = join(projectRoot, 'arxived_results');
    const destination = join(archiveRoot, relative(inside(resultsRoot, path) ? resultsRoot : projectRoot, path));
    const destinationDir = dirname(destination);
    await safePath(projectRoot, destinationDir, true);
    // Check every destination before copying. COPYFILE_EXCL also prevents overwrite races.
    for (const file of files) {
      try {
        await lstat(join(destinationDir, file.name));
        fail(409, 'An archived file already exists at this path. Existing records were preserved.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await mkdir(destinationDir, {recursive:true});
    const copied = [];
    try {
      for (const file of files) {
        const target = join(destinationDir, file.name), info = await lstat(file.source);
        await copyFile(file.source, target, constants.COPYFILE_EXCL);
        copied.push(target);
        await utimes(target, info.atime, info.mtime);
      }
    } catch (error) {
      for (const path of copied) await unlink(path);
      await removeEmptyDirectory(destinationDir, roots);
      throw error;
    }
    // Only remove originals after the entire bundle has been copied successfully.
    for (const file of files) if (file.remove) await unlink(file.source);
    await removeEmptyDirectory(dir, roots);
    return {path:destination};
  } finally { locks.delete(lock); }
}
