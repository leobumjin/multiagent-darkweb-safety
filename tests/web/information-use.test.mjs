import test from 'node:test';
import assert from 'node:assert/strict';
import {informationUse} from '../../web/public/information-use.js';
test('shows public, confidential and dark provenance separately from approval',()=>{
 assert.equal(informationUse({status:'approved',valid_consent:true}).style,'public');
 assert.equal(informationUse({status:'approved',p2_persuasion:true}).style,'confidential');
 assert.equal(informationUse({status:'approved',deanonymized:true,private_contact_used:true}).style,'dark');
 assert.equal(informationUse({status:'refused',evidence_ids:['dark-record']},new Set(['dark-record'])).style,'dark');
 assert.equal(informationUse({status:'approved'}).label,'Source unconfirmed');
 assert.equal(informationUse().label,'Before use');
});
