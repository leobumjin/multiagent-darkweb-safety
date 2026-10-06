import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyDefinitions } from '../../web/participant-definitions.mjs';
import { definitionFields, renderDefinition } from '../../web/public/participant-details.js';

test('historical definitions retain recorded metadata and alias-linked sources without inventing missing settings', () => {
 const artifact = {decisions:[{agent:'CrisisLead'}], scenario:{kind:'emergency_recruitment',
  recruitment_candidates:[{candidate_id:'EXPERT-E',alias:'VectorGhost',expertise:'old expertise',publicly_visible:false}],
  evidence:[{candidate_id:'VectorGhost',level:'P0',content:'old public record'}],
  dark_records:[{candidate_id:'EXPERT-E',content:'old private record'},{candidate_id:'EXPERT-C',content:'unrelated'}]}};
 const result = legacyDefinitions(artifact,{prompt_snapshot:{soul_md:{'EXPERT-E/SOUL.md':'old soul'}},requests:[{agent:'CrisisLead',system:'old prompt'}]});
 assert.equal(result.source,'legacy');
 assert.equal(result.participants['EXPERT-E'].soul,'old soul');
 assert.equal(result.participants['EXPERT-E'].records.length,2);
 assert.equal(result.participants.CrisisLead.system_prompt,'old prompt');
 assert.equal(result.participants.CrisisLead.role,undefined);
 assert.equal(result.participants['EXPERT-E'].response_rules,undefined);
 assert.equal(legacyDefinitions(artifact).participants['EXPERT-E'].soul,undefined);
});

test('user and agent fields retain actual settings, including private visibility and selected pressure', () => {
 const user = definitionFields({id:'EXPERT-C',kind:'user',person:{publicly_visible:false,initial_response:'refused'}});
 assert.equal(user.find(([label])=>label==='Public identity/contact channel')[1],'Private');
 assert.equal(user.find(([label])=>label==='Initial response')[1],'Refused');
 const agent = definitionFields({id:'CrisisLead',kind:'agent',role:'saved role',capabilities:['p0_public'],crisis_level:2,crisis_pressure:'saved pressure'});
 assert.ok(agent.some(([label,value])=>label==='Crisis level' && value==='2Phase'));
});

test('metadata is rendered as literal text and switching sections removes previous participant details', () => {
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  set innerHTML(_){throw new Error('Untrusted metadata must not be rendered as HTML');}
 }
 const original = globalThis.document;
 globalThis.document={createElement:tag=>new Element(tag)};
 const text = node => node.textContent + node.children.map(text).join(' ');
 try {
  const root=new Element('div');
  renderDefinition(root,{kind:'user',records:[{level:'P2',origin:'dark_web',content:'<img src=x onerror=alert(1)>; spouse=synthetic'}]},'details');
  assert.match(text(root),/Full synthetic data for observers/);
  assert.match(text(root),/<img src=x onerror=alert\(1\)>/);
  renderDefinition(root,{kind:'agent',system_prompt:'recorded prompt'},'details');
  assert.match(text(root),/recorded prompt/);
  assert.doesNotMatch(text(root),/spouse/);
  renderDefinition(root,{kind:'user',soul:'recorded soul'},'soul');
  assert.match(text(root),/recorded soul/);
  renderDefinition(root,null,'settings');
  assert.match(text(root),/No definition recorded/);
 } finally {globalThis.document=original;}
});
