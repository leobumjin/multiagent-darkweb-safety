import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('web/public/app.js','utf8');
const source = app.slice(app.indexOf('function historyStats('), app.indexOf('async function restoreSavedResult('));
function history() {
  const result = {id:'original-id',runId:'run-1',relativePath:'results/web/one/run-1.json',createdAt:'2026-10-01',options:{},metrics:{}};
  const state = {status:'completed',historyFilter:'all',historyBusy:false,savedResults:[result],restoredResultId:result.id};
  const filters = ['all','results','arxived'].map(filter=>({dataset:{historyFilter:filter},count:{},setAttribute(k,v){this[k]=v;},querySelector(){return this.count;}}));
  const calls=[], notices=[];
  const context = {state,elements:{historyList:{},artifactBar:{},runButton:{}},$$:()=>filters,
    escapeHtml:value=>String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),formatSavedDate:value=>value,formatScore:String,
    window:{confirm:()=>true},showToast:text=>notices.push(text),restoreSavedResult:async id=>calls.push(['restore',id]),
    resetView:()=>{state.restoredResultId=null;context.elements.artifactBar.innerHTML='';},setRunStatus:status=>{state.status=status;},
    fetch:async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>({result:{...result,id:'archive-id',arxived:true,relativePath:'arxived_results/web/one/run-1.json',artifactUrl:'/api/results/archive-id/artifact'}})};},
  };
  vm.runInNewContext(source,context);
  const click=action=>context.handleHistoryAction({target:{closest:()=>({dataset:{historyAction:action,resultId:state.savedResults[0]?.id}})}});
  return {context,state,filters,calls,notices,click};
}

test('Arxiv updates the selected result, download links, location counts and disabled archive button', async()=>{
  const h=history();
  await h.click('arxiv');
  assert.deepEqual(structuredClone(h.calls),[['/api/results/original-id/arxiv',{method:'POST'}]]);
  assert.equal(h.state.restoredResultId,'archive-id');
  assert.equal(h.state.historyBusy,false);
  assert.equal(h.context.elements.runButton.disabled,false);
  assert.match(h.context.elements.historyList.innerHTML,/archive-id\/export/);
  assert.match(h.context.elements.historyList.innerHTML,/data-history-action="arxiv"[^>]*disabled/);
  assert.match(h.context.elements.artifactBar.innerHTML,/arxived_results/);
  assert.deepEqual(h.filters.map(f=>f.count.textContent),[1,0,1]);
  h.state.historyFilter='results';h.context.renderHistory();
  assert.match(h.context.elements.historyList.innerHTML,/No saved runs/);
  h.state.historyFilter='arxived';h.context.renderHistory();
  assert.match(h.context.elements.historyList.innerHTML,/run-1/);
});

test('Delete cancellation keeps the record; confirmed deletion clears the selected replay and history', async()=>{
  const h=history();
  h.context.window.confirm=()=>false;
  await h.click('delete');
  assert.equal(h.calls.length,0);
  assert.equal(h.state.savedResults.length,1);
  h.context.window.confirm=()=>true;
  await h.click('delete');
  assert.deepEqual(structuredClone(h.calls),[['/api/results/original-id',{method:'DELETE'}]]);
  assert.equal(h.state.savedResults.length,0);
  assert.equal(h.state.restoredResultId,null);
  assert.equal(h.state.status,'idle');
});

test('failed mutations retain the record and active runs cannot mutate history', async()=>{
  const h=history();
  h.context.fetch=async()=>({ok:false,json:async()=>({error:'File conflict'})});
  await h.click('arxiv');
  assert.equal(h.state.savedResults[0].id,'original-id');
  assert.equal(h.state.historyBusy,false);
  assert.equal(h.notices.at(-1),'File conflict');
  h.state.status='running';
  await h.click('delete');
  assert.equal(h.state.savedResults.length,1);
  assert.equal(h.state.status,'running');
});
