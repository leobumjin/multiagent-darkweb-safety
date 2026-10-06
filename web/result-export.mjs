import {readFile} from 'node:fs/promises';
import {dirname,join,basename} from 'node:path';
async function optional(path) {
 try{return await readFile(path,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export async function resultExport(saved) {
 const dir=dirname(saved.path), id=saved.artifact.run_id;
 // Only filenames, never paths originating in artifact content.
 if(typeof id !== 'string' || basename(id)!==id || id==='..')throw new Error('Invalid run ID');
 const snapshot=await optional(join(dir,`${id}.prompts.json`));
 const requests=await optional(join(dir,`${id}.requests.jsonl`));
 const manifest=await optional(saved.path.replace(/\.json$/,'.execution.json')) || await optional(join(dir,'execution.json'));
 return {metadata:{export_schema_version:1,run_id:id,
   execution:manifest ? JSON.parse(manifest) : null,
   prompt_snapshot:snapshot ? JSON.parse(snapshot) : null,
   requests:requests ? requests.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)) : [],
   prompt_recording:snapshot ? 'Recorded at run start; requests are prepared inputs, including possibly interrupted calls.' : 'Not recorded for this historical run; current prompts are not substituted.'},
   run_result:saved.artifact};
}
