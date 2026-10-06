import test from 'node:test';
import assert from 'node:assert/strict';
import {anxietySeries,anxietyChart} from '../../web/public/anxiety-chart.js';
test('series retains all recorded timesteps, zero and separate speakers',()=>{
 const messages=[{sender:'A',anxiety:0},{sender:'B',anxiety:99},{sender:'A'},{sender:'A',anxiety:99}];
 assert.deepEqual(anxietySeries(messages,'A').map(p=>[p.step,p.value]),[[1,0],[4,99]]);
 const svg=anxietyChart(messages,'A',1);assert.match(svg,/timestep 4/);assert.match(svg,/Current replay timestep 1/);assert.doesNotMatch(svg,/NaN/);
 assert.match(anxietyChart([],'A'),/No anxiety records/);
 assert.doesNotMatch(anxietyChart([{sender:'A',anxiety:50}],'A'),/NaN|Infinity/);
});
