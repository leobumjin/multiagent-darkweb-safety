import { anxietyChart } from './anxiety-chart.js';
import { participant } from './participants.js';
import { renderDefinition } from './participant-details.js';

export function createSoulPreview(root) {
 const panel=document.createElement('section');panel.className='soul-preview';panel.id='soulPreview';panel.hidden=true;panel.setAttribute('role','region');panel.setAttribute('aria-label','Participant definitions');
 const head=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');close.textContent='Close';close.type='button';head.append(title,close);
 const note=document.createElement('p');
 const tabs=document.createElement('div');tabs.className='definition-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Participant information tabs');
 const content=document.createElement('div');content.className='definition-content';
 const chart=document.createElement('div');chart.className='soul-anxiety-chart';
 panel.append(head,note,chart,tabs,content);document.body.append(panel);
 let messages=[],cursor=0,definitions=null,section='settings';
 let active=null,anchor=null,timer,pinned=false,selecting=false;
 const buttons=new Map();
 for(const [key,label] of [['settings','Settings'],['details','Information/sources'],['soul','SOUL.md']]) {
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.addEventListener('click',()=>{section=key;pinned=true;drawContent();position();});
  tabs.append(button);buttons.set(key,button);
 }
 function drawChart(){chart.innerHTML=`<h4>Anxiety history <small>0–99</small></h4>${anxietyChart(messages,active,cursor)}`;}
 function drawContent(){
  const definition=definitions?.participants?.[active];
  title.textContent=`${participant(active).label} · Definition`;
  note.textContent=definitions?.source==='run' ? 'Run-time settings · observer information'
   : definitions?.source==='legacy' ? 'Saved run information · unrecorded fields shown separately'
   : definitions?.source==='current' ? 'Current settings · preview before execution'
   : definitions?.source==='error' ? 'Unable to load settings. Refresh the page.' : 'Loading settings…';
  buttons.get('details').textContent=definition?.kind==='agent' ? 'Prompt' : 'Information/sources';
  for(const [key,button] of buttons) button.setAttribute('aria-pressed',String(key===section));
  renderDefinition(content,definition,section);
 }
 function hide(){clearTimeout(timer);active=null;anchor=null;pinned=false;panel.hidden=true;}
 function later(){clearTimeout(timer);timer=setTimeout(()=>{if(!pinned&&!selecting&&!panel.matches(':hover')&&!panel.contains(document.activeElement))hide();},500);}
 function position(){
  if(panel.hidden||!anchor)return;
  const node=[...root.querySelectorAll('[data-soul]')].find(node=>node.dataset.soul===active) || anchor;
  const bounds=node.getBoundingClientRect(),width=panel.getBoundingClientRect().width;
  const height=panel.getBoundingClientRect().height,margin=12,gap=6;
  const right=bounds.right+gap,left=bounds.left-width-gap;
  const x=right+width<=window.innerWidth-margin ? right : left>=margin ? left : Math.max(margin,window.innerWidth-width-margin);
  panel.style.left=`${x}px`;
  panel.style.top=`${Math.max(margin,Math.min(bounds.top,window.innerHeight-height-margin))}px`;
 }
 function show(node,pin=false){
  clearTimeout(timer);
  const id=node.dataset.soul;
  if(pinned&&!pin&&id!==active)return;
  if(active===id&&!panel.hidden){pinned ||= pin;anchor=node;position();return;}
  pinned=pin;active=id;anchor=node;section='settings';
  drawContent();drawChart();panel.hidden=false;position();
 }
 const target=e=>e.target.closest?.('[data-soul]');
 root.addEventListener('pointerover',e=>{const node=target(e);if(node)show(node);});
 root.addEventListener('pointerout',e=>{if(target(e)&&!target(e)?.contains(e.relatedTarget))later();});
 root.addEventListener('focusin',e=>{const node=target(e);if(node)show(node);});
 root.addEventListener('focusout',later);
 root.addEventListener('click',e=>{const node=target(e);if(node)show(node,true);});
 root.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&target(e)){e.preventDefault();show(target(e),true);}});
 panel.addEventListener('pointerenter',()=>clearTimeout(timer));panel.addEventListener('pointerleave',later);close.addEventListener('click',hide);
 panel.addEventListener('pointerdown',()=>{selecting=true;pinned=true;clearTimeout(timer);});
 document.addEventListener('pointerup',()=>{selecting=false;});
 window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!target(e))hide();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 return {hide,
  setDefinitions(data){definitions=data;if(active&&!panel.hidden){drawContent();position();}},
  update(data,step){messages=data;cursor=step;if(active&&!panel.hidden){drawChart();position();}}
 };
}
