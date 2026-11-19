import {enableSelection} from './selection.js';
import { coachGear, equipmentQuestions, evaluateEspresso, openings, updateCoachAnswer } from './espresso-coach.js';
import { coachScreen, followQuestions, nextBaseline } from './coach-ui.js';
import {chatCapability,shotContext,sendChat} from './chat.js';
import {EQUIPMENT,emptyState,id,positive,localDate,age,bagDateError,storageDateError,ratioOf,targetYield,extraction,scaleItems,isCapsule,startingRecipe,labelSuggestions,prepSteps,validTimerTarget,shotClock,pourAnimation,measuredShotTime,round} from './core.js';
import {load,persist,importData} from './storage.js';
import {SYRUPS,drinks,milkFor,matchImportedRecipe,brewedDrinkChoices,MILK_PREFERENCES} from './recipes.js';
import {e,heading,link,metric,error,bagName,measure,displayRatio,brewView,hasEquipment,unfinishedShot,brewControls,brewTimer,planDisplay} from './ui.js';
import * as view from './views.js';
import {offlineMessages,prepareOffline} from './offline.js';
import {recipeURL,parseRecipeText,loadRecipeLink,recipeUnits} from './recipe-import.js';

const main = document.getElementById('main');
const notice = document.getElementById('notice');
const install = document.getElementById('install');
const nav = document.getElementById('nav');
const choices = [['Dashboard','home'],['Brew','brew'],['Beans','beans'],['History','history'],['Recipes','recipes']];
const unavailable = '<p>That item may have been removed.</p>';
const emptyActual = () => ({dose:null,yieldG:null,seconds:null,tds:null,timing:'unknown'});
const clean = (fields,key) => String(fields.get(key) ?? '').trim();
const numeric = (fields,key) => {
  const value=clean(fields,key);
  return value && Number.isFinite(Number(value)) ? Number(value) : null;
};
const gearFrom = f => ({...Object.fromEntries(Object.keys(EQUIPMENT).filter(key=>f.has(key)||Object.hasOwn(state.equipment,key)).map(key=>[key,f.has(key)?clean(f,key)||'Not sure':state.equipment[key]])),ratedDose:f.has('ratedDose')?numeric(f,'ratedDose'):state.equipment.ratedDose??null});
const actualFrom = f => ({dose:numeric(f,'dose'),yieldG:numeric(f,'yieldG'),seconds:numeric(f,'seconds'),tds:numeric(f,'tds'),timing:clean(f,'timing')||'unknown'});
const tasteFrom = f => ({tastes:f.getAll('taste'),flows:f.getAll('flow'),rating:numeric(f,'rating'),note:clean(f,'note'),change:clean(f,'change'),detail:''});
const snapshot = (bag,portion) => ({
  name:bag?.name||'',roaster:bag?.roaster||'',roast:bag?.roast||'',roastLevel:bag?.roastLevel||'',opened:bag?.opened||'',method:bag?.method||'',
  portionName:portion?.name||'',portionMethod:portion?.method||'',frozen:portion?.frozen||'',thawed:portion?.thawed||''
});
let state=emptyState();
let quickPouring=null;
let clockTick;
let directCoach=null;
let brewCoach=null;
let drinkOptions={...view.defaultDrink};
try {
  const remembered=JSON.parse(localStorage.getItem('morning-pull-drinks')??sessionStorage.getItem('morning-pull-drinks'));
  if(remembered && Array.isArray(remembered.pantry)) drinkOptions={...drinkOptions,...remembered};
  if(!MILK_PREFERENCES.includes(drinkOptions.milk)) drinkOptions.milk='No preference';
  if(drinkOptions.diet==='Dairy-free'&&MILK_PREFERENCES.indexOf(drinkOptions.milk)>=2) drinkOptions.milk=milkFor(drinkOptions.milk,drinkOptions.diet);
} catch {}
let restoreCandidate=null;
let selection=new Set();
let photoDraft=null;
let photoRequest=0;
let ocrDraft=null;
let noticeTimer;
let installEvent;
let busy=false;
let storageReady=false;
let offlineStatus='pending';
let editingEquipment=false;
let lastRoute='';
let activeRecipe=null;
let importDraft=null;
let importChoices=[];
let importSource='';
let previousStep=0;
let chatInfo;
const route = () => location.hash.slice(1).split('/').map(part=>{
  try { return decodeURIComponent(part); } catch { return ''; }
});
function jump(next){
  if (location.hash === '#'+next) render();
  else location.hash=next;
}
function toast(message) {
  clearTimeout(noticeTimer);
  notice.textContent=message;
  noticeTimer=setTimeout(()=>{notice.textContent='';},4200);
}
async function commit(update) {
  if (!storageReady) throw new Error('Browser storage is unavailable. Enable site storage to save your journal.');
  const next={...state,...update,updatedAt:id()};
  await persist(next,state.updatedAt);
  state=next;
}
const commitDraft = fields => commit({draft:{...state.draft,...fields}});
function newDraft(parent=null,coffee=state.draft) {
  const gear={...(hasEquipment(state.equipment)?state.equipment:(parent??coffee)?.gear)};
  const bag=getBag((parent??coffee)?.bagId);
  const goal=parent?.goal ?? 'Balanced';
  const planned=parent?{...parent.planned,basis:'repeat',
    dose:isCapsule(gear)?null:parent.planned.dose,
    temperature:gear.temperature==='Adjustable'?parent.planned.temperature:null,
    preInfusion:gear.infusion==='Adjustable'?parent.planned.preInfusion:null
  }:startingRecipe(gear,bag,goal,state.shots,(parent??coffee)?.portionId);
  return {step:parent?3:1,gear,goal,planned,actual:emptyActual(),bagId:bag?.id??'',portionId:bag?.id?(parent??coffee)?.portionId??'':'',
    parentId:parent?.id??'',savedId:'',...view.freshTaste()};
}
const pendingBrew = draft => draft && (draft.step<5 || draft.step===5 && !draft.pouring && draft.timer?.startedAt==null);
const unfinishedCoach = () => Boolean(directCoach && !directCoach.savedId);
function planFor(draft,gear){
  return startingRecipe(gear,getBag(draft.bagId),draft.goal,state.shots,draft.portionId);
}
async function saveEquipment(gear,goal=state.draft?.goal){
  const old=state.equipment;
  if(old.machine&&old.machine!=='Not sure'&&gear.machine!==old.machine){
    for(const key of ['basket','ratedDose','temperature','infusion','timer','tamper','distribution','warmup']){
      if(gear[key]===old[key]) delete gear[key];
    }
  }
  if(gear.basket!==old.basket&&gear.ratedDose===old.ratedDose) delete gear.ratedDose;
  if(gear.machine==='Automatic / bean-to-cup'||gear.machine==='Capsule machine'){
    gear.basket=gear.machine==='Capsule machine'?'Capsule':'Built-in basket';
    gear.ratedDose=null;
  }else if(['Built-in basket','Capsule'].includes(gear.basket) && gear.machine!==old.machine){
    gear.basket='Not sure';
    gear.ratedDose=null;
  }
  const draft=state.draft;
  const changed=Object.keys({...old,...gear}).some(key=>(old[key]??null)!==(gear[key]??null));
  const replan=pendingBrew(draft)&&(changed||goal!==draft.goal);
  const update=replan?{draft:{...draft,goal,gear,planned:planFor({...draft,goal},gear),test:null,coachUndo:null,prepChecked:[]}}:{};
  await commit({equipment:gear,...update});
  if(changed&&unfinishedCoach()){
    for(const key of Object.keys(equipmentQuestions)) delete directCoach.answers[key];
    for(const key of ['basketFit','basketCondition','doseFit','equipmentIssue','warm','repeat','interruption']) delete directCoach.answers[key];
    directCoach.gear=gear;
    directCoach.planned=planFor({...directCoach,goal:'Balanced'},gear);
    directCoach.question=null;
    directCoach.trail=[];
    directCoach.undone=false;
  }
}
const allRecipes = () => [...state.recipes,...SYRUPS,...drinks(drinkOptions)];
const getRecipe = key => {
  const recipe=allRecipes().find(r=>r.id===key);
  return recipe&&matchImportedRecipe(recipe,drinkOptions);
};
const getBag = key => state.bags.find(b=>b.id===key);
const getShot = key => state.shots.find(s=>s.id===key);
const recentFor = bagId => bagId ? state.shots.find(s=>s.bagId===bagId) : null;
const navGroup = page => /^(bean|bag|portion|refreeze)/.test(page) ? 'beans' : /^(history|shot|compare|favorites)/.test(page) ? 'history' :
  /^(recipes?|drinks)/.test(page) ? 'recipes' : ['brew','timer','coach','calculator','brew-drinks','brew-drink'].includes(page)?'brew':page;

function render(focus=false) {
  const [page='home',key,part]=route();
  const home=page || 'home';
  const routeKey=location.hash;
  if(routeKey!==lastRoute){
    editingEquipment=false;
    if(home!=='recipe-import'){
      importDraft=null;
      importChoices=[];
      importSource='';
    }
    photoDraft=null;
    ocrDraft=null;
    restoreCandidate=null;
    lastRoute=routeKey;
  }
  nav.innerHTML=choices.map(([label,address])=>`<a href="#${address}"${navGroup(home)===address?' aria-current="page"':''}>${label}</a>`).join('');
  const bag=getBag(key);
  const shot=getShot(key);
  let content;
  activeRecipe=null;
  switch(home){
    case 'home': content=view.home(state,unfinishedCoach()); break;
    case 'brew':
      content=state.draft && [6,7].includes(state.draft.step)?renderCoach(false):
        state.draft?brewView(state.draft,state,editingEquipment):heading('Pull a shot')+link('Dashboard','home','ghost');
      break;
    case 'timer': content=view.quickBrew(quickPouring); break;
    case 'equipment': content=view.equipmentView(state.equipment,key); break;
    case 'calculator': content=view.calculator(); break;
    case 'coach': content=renderCoach(true); break;
    case 'beans': case 'beans-archived': content=view.beansView(state,home==='beans-archived'); break;
    case 'bag-new': case 'bag-edit': content=home==='bag-edit'&&!bag?unavailable:view.bagEdit(bag??{},key==='brew',photoDraft); break;
    case 'bag': content=bag?view.bagView(bag,state):unavailable; break;
    case 'portion': case 'refreeze': content=bag?view.portionEdit(bag,bag.portions.find(p=>p.id===part),home==='refreeze'):unavailable; break;
    case 'history': case 'favorites': content=view.historyView(state,selection,home==='favorites'); break;
    case 'shot': content=shot?view.shotView(shot,state):unavailable; break;
    case 'shot-edit': content=shot?view.shotEdit(shot):unavailable; break;
    case 'compare': content=view.compareView(state.shots.filter(s=>selection.has(s.id))); break;
    case 'brew-drinks':
    case 'brew-drink': {
      if(!brewingShot(key)){
        content=heading('Make a drink')+link('Back to dashboard','home','ghost');
        break;
      }
      const picks=brewedDrinkChoices(state.recipes,drinkOptions);
      const recipe=[...picks.favorites,...picks.suggestions].find(r=>r.id===part)??selectedCupRecipe(part);
      content=home==='brew-drink'&&recipe?view.brewedDrinkRecipe(recipe,key):view.brewedDrinkPicker(picks,key);
      break;
    }
    case 'drinks': case 'recipes': case 'recipe-favorites': content=view.recipeHome(state,home==='recipes'?'syrups':home==='drinks'?'drinks':'favorites',drinkOptions); break;
    case 'recipe':
      activeRecipe=getRecipe(key);
      content=activeRecipe?view.recipeView(activeRecipe,state.recipes.some(r=>r.id===key)):unavailable;
      break;
    case 'recipe-import':
      activeRecipe=importDraft;
      content=importDraft?view.recipeEdit(importDraft,true):view.recipeImport(importChoices,importSource);
      break;
    case 'recipe-new': case 'recipe-edit':
      activeRecipe=home==='recipe-new'?{kind:key==='drink'?'drink':'syrup'}:getRecipe(key);
      content=activeRecipe?view.recipeEdit(activeRecipe):unavailable;
      break;
    case 'settings': content=view.settingsView(state,{offlineStatus,storageReady,editingEquipment}); break;
    default: content=view.home(state);
  }
  main.innerHTML=content;
  refreshBrewClock();
  if(home==='calculator') refreshCalculation(main.querySelector('form'));
  if(home==='coach') void showChat();
  if(focus || (home==='brew' && previousStep!==state.draft?.step)){
    main.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  }
  previousStep=home==='brew'?state.draft?.step:0;
}
async function enter() {
  if(route()[0]==='brew' && (!state.draft || state.draft.step===8)){
    try { await commit({draft:newDraft()}); }
    catch (err) { toast(err.message); }
  }
  render(true);
}
function refreshCalculation(node) {
  const f=new FormData(node);
  const d=numeric(f,'dose');
  const y=numeric(f,'yieldG');
  const t=numeric(f,'tds');
  const r=numeric(f,'ratio');
  const valid=(v,max)=>positive(v,max)?v:null;
  node.querySelector('#calculated').innerHTML=metric([
    ['Brew ratio',displayRatio(ratioOf(valid(d,60),valid(y,500)))],
    ['Target yield',measure(targetYield(valid(d,60),valid(r,10)),'g')],
    ['Extraction yield',measure(extraction(valid(d,60),valid(y,500),valid(t,100)),'%')]
  ]);
}
function activeSession(){
  const direct=route()[0]==='coach';
  if(direct && directCoach) return directCoach;
  if(!direct && brewCoach && brewCoach.origin===state.draft) return brewCoach;
  const origin=direct?null:state.draft;
  const gear=origin?.gear??state.equipment;
  const bagId=origin?.bagId??'';
  const recorded=origin?.actual??emptyActual();
  const actual=measuredShotTime(recorded)?{...recorded}:{...recorded,seconds:null,timing:'unknown'};
  const session={
    origin,gear,bagId,portionId:origin?.portionId??'',screen:origin?.timerReading?'confirm-timer':origin?.test?'test-result':direct||origin?.quickLog?'notice':'start',
    timerReading:origin?.timerReading,
    planned:origin?.planned??startingRecipe(gear,null,'Balanced'),actual,
    answers:{taste:origin?.tastes?.includes('Sour')&&origin?.tastes?.some(t=>t==='Bitter'||t==='Dry')?'Mixed':origin?.tastes?.[0],flow:origin?.flows?.find(f=>!['Not sure','Inconsistent'].includes(f))?.replace('Spraying','Uneven')},
    undone:false,note:origin?.note??'',...structuredClone(origin?.coach),savedId:origin?.savedId??''
  };
  if(direct) directCoach=session;
  else brewCoach=session;
  return session;
}
function coachOutcome(session){
  const bag=getBag(session.bagId);
  const portion=bag?.portions.find(p=>p.id===session.portionId);
  const previous=session.bagId?state.shots.find(s=>s.id!==session.savedId && s.bagId===session.bagId && s.portionId===session.portionId):null;
  return evaluateEspresso({...session,bag,portion,previous});
}
const displayedOutcome=session=>session.question?{...session.question,kind:'question'}:coachOutcome(session);
function rememberCoachStep(session){
  (session.trail??=[]).push({screen:session.screen,question:session.screen==='evaluate'?displayedOutcome(session):null});
}
function previousCoachStep(session){
  const step=session.trail?.pop();
  if(!step)return;
  session.screen=step.screen;
  session.question=step.question?.kind==='question'?step.question:null;
}
function editCoachItem(session,key){
  rememberCoachStep(session);
  if(['context','note'].includes(key)){
    session.screen='edit-'+key;
    session.question=null;
  }else if(followQuestions[key]){
    session.question=followQuestions[key];
    session.screen='evaluate';
  }
}
function renderCoach(direct){
  const session=activeSession();
  return coachScreen(session,state,getBag(session.bagId),session.screen==='evaluate'?displayedOutcome(session):null,direct||session.origin?.quickLog);
}
function runCoachAnswer(session,key){
  rememberCoachStep(session);
  if(session.screen==='start'){
    if(key==='good'){session.answers.taste='Balanced';session.screen='evaluate';}
    else session.screen=key==='describe'?'taste':'notice';
  }else if(session.screen==='notice'){
    session.screen=key==='flow'?'flow':'taste';
  }else if(session.screen==='taste'||session.screen==='flow'){
    updateCoachAnswer(session.answers,session.screen,key);
    session.screen='evaluate';
  }else if(session.screen==='confirm-note'){
    if(key==='confirm'){
      updateCoachAnswer(session.answers,session.noteKind,session.noteKey);
      session.screen='evaluate';
    }else session.screen='taste';
  }else if(session.screen==='evaluate'){
    const question=displayedOutcome(session);
    if(question.kind!=='question')return;
    if(question.key==='yield'){
      session.answers.noYield=true;
      session.actual={...session.actual,yieldG:null};
    }else if(question.key==='dose'){
      session.answers.noDose=true;
      session.actual={...session.actual,dose:null};
    }else{
      updateCoachAnswer(session.answers,question.key,key);
    }
    session.question=null;
  }
  session.undone=false;
}
function setCoachNote(session,value){
  session.note=value;
  const patterns=[
    ['flow','Uneven',/spray|sputter|spurts/i],['flow','Fast',/gush|rushed/i],['flow','Slow',/barely drip/i],
    ['taste','Mixed',/(?=.*sour)(?=.*bitter)/i],['taste','Sour',/lemon|sour|sharp/i],['taste','Dry',/drying|dry finish/i],
    ['taste','Bitter',/bitter/i],['taste','Weak',/watery|thin/i],['taste','Too intense',/too strong|intense/i],['taste','Other',/stale|flat|muted/i]
  ];
  const match=patterns.find(([, , pattern])=>pattern.test(value));
  if(!match){session.screen='taste';return;}
  [session.noteKind,session.noteKey]=match;
  session.noteChoice=openings[session.noteKind].find(([key])=>key===session.noteKey)[1];
  session.screen='confirm-note';
}
function coachingRecord(session){
  const {taste,flow}=session.answers;
  return {actual:session.actual,tastes:taste==='Mixed'?['Sour','Bitter']:taste&&taste!=='unknown'?[taste]:[],
    flows:flow&&flow!=='unknown'?[flow]:[]};
}
async function showChat(){
  if(!navigator.onLine) return;
  const node=main.querySelector('#connected-chat');
  chatInfo ??= chatCapability();
  const info=await chatInfo;
  if(!info || !node?.isConnected) return;
  node.innerHTML=`<details><summary>Connected AI chat</summary>
    <p class="small">Your message goes to ${e(info.provider)}. You can include the current measurements, taste, flow, basic bean details, and coach suggestion. Bag photos and the full journal stay on this device. Chat requires internet.</p>
    <form data-form="chat"><label class="label">Message <textarea required maxlength="1000" name="message"></textarea></label>
      <label><input type="checkbox" name="include"> Include current shot context</label>
      <div class="actions"><button type="submit">Send to ${e(info.provider)}</button></div>
      <p class="error" role="alert" hidden></p><p class="small" id="chat-reply" aria-live="polite"></p>
    </form></details>`;
}
function brewingShot(page){
  if(page==='timer') return quickPouring;
  const draft=state.draft;
  return page==='brew'&&draft?.step===5&&(draft.pouring||draft.timer?.startedAt!=null)?draft:null;
}
const currentPour = () => brewingShot(route()[0]);
function selectedCupRecipe(key){
  const saved=state.recipes.find(r=>r.id===key);
  if(!saved) return null;
  const choices=brewedDrinkChoices([{...saved,favorite:true}],drinkOptions);
  const recipe=choices.favorites[0];
  return recipe?{...recipe,favorite:saved.favorite}:null;
}
async function updatePour(fields){
  if(route()[0]==='timer') quickPouring={...quickPouring,...fields};
  else await commitDraft(fields);
}
function refreshBrewClock(){
  clearInterval(clockTick);
  const draft=currentPour();
  const art=main.querySelector('.pour-art');
  if(!draft||!art) return;
  const elapsed=main.querySelector('[data-elapsed]');
  const countdown=main.querySelector('[data-countdown]');
  const cue=main.querySelector('[data-clock-cue]');
  const tick=()=>{
    const now=Date.now();
    const clock=shotClock(draft.shotClock,draft.planned?.targetSeconds,now);
    if(clock){
      const text=(clock.running?Math.floor(clock.elapsed):round(clock.elapsed,1))+' s elapsed';
      if(elapsed.textContent!==text) elapsed.textContent=text;
      const remaining=clock.remaining+' s left';
      if(countdown.textContent!==remaining) countdown.textContent=remaining;
      if(cue.hidden===clock.reached) cue.hidden=!clock.reached;
    }
    const animation=pourAnimation(draft,clock,now);
    const mode=animation?.mode??'';
    if((art.dataset.pourMode??'')!==mode){
      if(animation) art.style.setProperty('--pour-offset',`-${animation.elapsed}s`);
      art.dataset.pourMode=mode;
    }
    return clock?.running||Boolean(animation);
  };
  if(tick()) clockTick=setInterval(()=>{if(!tick()) clearInterval(clockTick);},100);
}
function updateBrewControls(focus){
  const controls=main.querySelector('[data-brew-controls]');
  const draft=currentPour();
  if(!controls||!draft) return;
  controls.innerHTML=brewControls(draft);
  const edited=main.querySelector('[data-edited-target]');
  if(edited&&draft.targetEdited) edited.hidden=false;
  main.querySelector(focus)?.focus({preventScroll:true});
}
function updateBrewTimer(focus){
  const timer=main.querySelector('[data-brew-timer]');
  const draft=currentPour();
  if(!timer||!draft) return;
  timer.innerHTML=brewTimer(draft);
  refreshBrewClock();
  main.querySelector(focus)?.focus({preventScroll:true});
}
async function finishPour(quickMode){
  const draft=currentPour();
  if(!draft) return;
  const elapsed=shotClock(draft.shotClock,draft.planned?.targetSeconds)?.elapsed;
  const timerReading=positive(elapsed,3600)?Math.max(.1,round(elapsed,1)):null;
  if(quickMode){
    directCoach={origin:null,gear:draft.gear,planned:draft.planned,bagId:'',portionId:'',
      screen:timerReading?'confirm-timer':'start',timerReading,actual:emptyActual(),answers:{},undone:false,note:'',savedId:''};
    quickPouring=null;
    jump('coach');
  }else{
    const {timer,cue,shotClock:previousClock,decorativeStartedAt,...rest}=draft;
    await commit({draft:{...rest,step:6,pouring:false,timerReading,actual:emptyActual()}});
    render(true);
  }
}
async function saveCoachResult(session){
  const advice=coachOutcome(session);
  if(session.savedId||advice.kind==='question') return;
  const now=new Date();
  const bag=getBag(session.bagId);
  const portion=bag?.portions.find(p=>p.id===session.portionId);
  const parent=getShot(session.origin?.parentId)??recentFor(session.bagId);
  const entry={id:id(),createdAt:now.toISOString(),updatedAt:now.toISOString(),day:localDate(now),
    bagId:bag?.id??'',portionId:portion?.id??'',parentId:parent?.id??'',goal:session.origin?.goal??'Balanced',
    note:session.note,change:session.origin?.change??'',detail:'',bag:snapshot(bag,portion),gear:coachGear(session.gear,session.answers),
    planned:{...session.planned},...coachingRecord(session),rating:session.origin?.rating??null,favorite:false,advice};
  const savedDraft=session.origin?{...state.draft,savedId:entry.id,coach:coachProgress(session)}:null;
  await commit({shots:[entry,...state.shots],...(savedDraft?{draft:savedDraft}:{})});
  if(savedDraft) session.origin=state.draft;
  session.savedId=entry.id;
}
async function useCoachRecipe(session){
  const advice=coachOutcome(session);
  if(advice.kind==='question') return;
  if(!session.origin && unfinishedShot(state.draft) &&
      !window.confirm('Use this recipe in place of the unfinished walkthrough?')) return;
  const baseline=nextBaseline(session.planned);
  const draft=newDraft();
  const patch=session.undone?null:advice.patch;
  const test=advice.test||patch?{title:advice.title,instruction:advice.change,keep:advice.keep,report:advice.report}:null;
  const planned={...baseline,...patch,...(patch?.ratio?{basis:'coach'}:{})};
  await commit({draft:{...draft,step:3,bagId:session.bagId,portionId:session.portionId,gear:coachGear(session.gear,session.answers),planned,
    actual:emptyActual(),test,coachUndo:patch?baseline:null,goal:session.origin?.goal??draft.goal,
    parentId:session.savedId||session.origin?.parentId||''}});
  if(!session.origin) directCoach=null;
  brewCoach=null;
  jump('brew');
}
function exportBackup(){
  const {draft,updatedAt,...backup}=state;
  const file=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=url;
  a.download='morning-pull-'+localDate()+'.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function photoFor(file) {
  if(file.size>24000000) throw new Error('Choose an image under 24 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.src=url;
    await image.decode();
    const ratio=Math.min(1,1440/Math.max(image.width,image.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*ratio));
    canvas.height=Math.max(1,Math.round(image.height*ratio));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const full=canvas.toDataURL('image/jpeg',.82);
    return full.length<2_000_000?full:canvas.toDataURL('image/jpeg',.62);
  } finally { URL.revokeObjectURL(url); }
}
function updatePhoto(photo,formNode){
  const img=formNode.querySelector('#bag-photo');
  if(photo) img.src=photo;
  else img.removeAttribute('src');
  img.hidden=!photo;
  formNode.querySelector('#take-photo').textContent=photo?'Retake photo':'Take photo';
  formNode.querySelector('#choose-photo').textContent=photo?'Replace photo':'Choose photo';
  formNode.querySelector('#photo-status').textContent=photo?'Photo ready to review.':'';
  const reader=formNode.querySelector('#read-label');
  reader.hidden=!photo;
  reader.disabled=false;
  formNode.querySelector('#remove-photo').hidden=!photo;
  formNode.querySelector('#label-text').replaceChildren();
  formNode.querySelector('#label-status').textContent='';
  ocrDraft=null;
}
async function readLabel(button){
  const node=button.closest('form');
  const status=node.querySelector('#label-status');
  const found=node.querySelector('#label-text');
  const preview=node.querySelector('#bag-photo');
  const image=preview.getAttribute('src');
  const request=photoRequest;
  const current=()=>node.isConnected&&preview.getAttribute('src')===image&&photoRequest===request;
  if(!image) return;
  status.textContent='Opening the on-device label reader…';
  button.disabled=true;
  let worker,timer,expired=false;
  const assets=new URL('./ocr/',import.meta.url);
  const recognize=async()=>{
    if(!window.Tesseract){
      await new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src=new URL('tesseract.min.js',assets);
        script.onload=resolve;
        script.onerror=reject;
        document.head.append(script);
      });
    }
    worker=await window.Tesseract.createWorker('eng',1,{
      workerPath:new URL('worker.min.js',assets).href,workerBlobURL:false,
      corePath:new URL('tesseract-core-lstm.wasm.js',assets).href,langPath:assets.href,
      errorHandler:()=>{},logger:message=>{
        if(current()&&message.status==='recognizing text') status.textContent='Reading label… '+Math.round(message.progress*100)+'%';
      }
    });
    if(expired){
      await worker.terminate();
      return null;
    }
    return worker.recognize(image);
  };
  try {
    const timeout=new Promise((_,reject)=>{
      timer=setTimeout(()=>{
        expired=true;
        reject(new Error('Label reading timed out.'));
      },30000);
    });
    const {data}=await Promise.race([recognize(),timeout]);
    if(!current()) return;
    ocrDraft=labelSuggestions(data.text);
    const names={name:'Coffee name',roaster:'Roaster',roastLevel:'Roast level',roast:'Roast date',origin:'Origin',process:'Processing',notes:'Tasting notes'};
    const entries=Object.entries(ocrDraft);
    found.innerHTML=(entries.length?`<fieldset><legend>Review suggested fields</legend><div class="stack">${entries.map(([key,value])=>`<label><input type="checkbox" value="${key}" name="ocr-field" checked> ${names[key]} · ${e(value)}</label>`).join('')}</div><button type="button" data-action="apply-label">Use checked suggestions</button></fieldset>`:'')+
      (data.text.trim()?`<details><summary>Read label text</summary><p class="small" style="white-space:pre-wrap">${e(data.text.slice(0,4000))}</p></details>`:'');
    status.textContent=entries.length?'Confirm any details you want to use.':'No labeled fields recognized. You can still enter the bag details by hand.';
  }catch {
    if(current()) status.textContent='Label reading is unavailable. Keep the photo and enter details by hand. The first run needs the language files to download.';
  }finally{
    clearTimeout(timer);
    try { await worker?.terminate(); } catch {}
    if(current()) button.disabled=false;
  }
}
async function submitForm(node) {
  const f=new FormData(node);
  const [page,key,part]=route();
  switch(node.dataset.form){
    case 'brew-bean': {
      const bagId=clean(f,'bagId');
      const portionId=clean(f,'portionId');
      await commitDraft({step:2,bagId,portionId});
      break;
    }
    case 'brew-gear': {
      const goal=clean(f,'goal');
      if(f.has('machine')){
        await saveEquipment(gearFrom(f),goal);
        editingEquipment=false;
        toast('Equipment saved.');
      }else{
        const gear={...state.equipment};
        const planned=startingRecipe(gear,getBag(state.draft.bagId),goal,state.shots,state.draft.portionId);
        await commitDraft({step:3,gear,goal,planned});
      }
      break;
    }
    case 'brew-plan': {
      const draft=state.draft;
      const old=draft.planned;
      const dose=numeric(f,'dose');
      const cup=numeric(f,'cupTarget');
      if(cup!==null&&dose===null) throw new Error('Enter a dry dose to use this cup target.');
      const ratio=cup===null?old.ratio:cup/dose;
      if(!positive(ratio,10)) throw new Error('The cup target must be no more than ten times the dry dose.');
      const edited=cup!==null&&cup!==targetYield(old.dose,old.ratio)||dose!==old.dose;
      const planned={...old,dose,ratio,timing:'unknown',temperature:numeric(f,'temperature'),...(edited?{basis:'custom'}:{})};
      const {timer,cue,shotClock:previousClock,decorativeStartedAt,...rest}=draft;
      await commit({draft:{...rest,step:5,pouring:true,planned,prepChecked:f.getAll('prep'),coachUndo:null,actual:emptyActual()}});
      break;
    }
    case 'brew-yield': {
      const draft=currentPour();
      if(!draft) return;
      const grams=numeric(f,'cupTarget');
      const ratio=ratioOf(draft.planned.dose,grams);
      if(!positive(grams,500)||!positive(ratio,10)) throw new Error('Enter a cup target up to 500 g and no more than ten times the dose.');
      await updatePour({planned:{...draft.planned,ratio,basis:'custom'},targetEdited:true});
      updateBrewControls('[data-value="brew-yield"]');
      return;
    }
    case 'brew-duration': {
      const draft=currentPour();
      if(!draft||draft.shotClock) return;
      const targetSeconds=numeric(f,'targetSeconds');
      if(!validTimerTarget(targetSeconds)) throw new Error('Enter a whole number from 1 to 3600 seconds.');
      await updatePour({planned:{...draft.planned,targetSeconds}});
      updateBrewTimer('[data-action="start-brew-timer"]');
      return;
    }
    case 'coach-test-result': {
      const session=activeSession();
      rememberCoachStep(session);
      session.actual={...session.actual,dose:numeric(f,'dose'),yieldG:numeric(f,'yieldG')};
      const answers=session.answers;
      updateCoachAnswer(answers,'taste',clean(f,'taste'));
      updateCoachAnswer(answers,'flow',clean(f,'flow'));
      answers.noYield=session.actual.yieldG===null;
      answers.noDose=session.actual.dose===null;
      session.question=null;
      session.undone=false;
      session.screen='evaluate';
      await finishCoachStep();return;
    }
    case 'coach-measure': {
      const session=activeSession();
      const question=displayedOutcome(session);
      if(question.kind!=='question'||!['yield','dose'].includes(question.key))return;
      rememberCoachStep(session);
      const field=question.key==='yield'?'yieldG':'dose';
      session.actual={...session.actual,[field]:numeric(f,field)};
      delete session.answers[question.key==='yield'?'noYield':'noDose'];
      session.question=null;
      session.undone=false;
      await finishCoachStep();return;
    }
    case 'coach-time': {
      const session=activeSession();
      rememberCoachStep(session);
      session.actual={...session.actual,seconds:numeric(f,'seconds'),timing:clean(f,'timing')||'unknown',timeSource:'manual'};
      delete session.answers.interruption;
      delete session.answers.noTime;
      session.question=null;
      session.undone=false;
      await finishCoachStep();return;
    }
    case 'coach-note':
      rememberCoachStep(activeSession());
      setCoachNote(activeSession(),clean(f,'note'));
      await finishCoachStep();return;
    case 'coach-context': {
      const session=activeSession();
      session.bagId=clean(f,'bagId');
      const bag=getBag(session.bagId);
      session.portionId=bag?.portions.some(p=>p.id===clean(f,'portionId'))?clean(f,'portionId'):'';
      if(!session.origin||session.origin.quickLog){
        session.gear=state.equipment;
        session.planned=startingRecipe(session.gear,bag,'Balanced',state.shots,session.portionId);
        delete session.answers.aroma;
      }
      previousCoachStep(session);
      await finishCoachStep();return;
    }
    case 'gear':
      await saveEquipment(gearFrom(f));
      editingEquipment=false;
      toast(pendingBrew(state.draft)?'Equipment saved. Your recipe uses this setup.':'Equipment saved.');
      if(page==='equipment'){
        jump(key==='brew'?'brew':'home');
        return;
      }
      break;
    case 'bag-edit': {
      const old=page==='bag-edit'?getBag(key):null;
      const now=new Date().toISOString();
      const bag={...Object.fromEntries(['name','roaster','roastLevel','roast','opened','origin','process','notes','method'].map(k=>[k,clean(f,k)])),
        id:old?.id??id(),photo:photoDraft??old?.photo??'',archived:old?.archived??false,portions:old?.portions??[],createdAt:old?.createdAt??now,updatedAt:now};
      if(!bag.name) throw new Error('Enter a coffee name.');
      const issue=bagDateError(bag)||bag.portions.flatMap(p=>[p,...(p.events??[])]).map(p=>storageDateError(p,bag)).find(Boolean);
      if(issue) throw new Error(issue);
      const bags=old?state.bags.map(b=>b.id===old.id?bag:b):[bag,...state.bags];
      const inBrew=key==='brew' && state.draft;
      await commit({bags,...(inBrew?{draft:{...state.draft,step:2,bagId:bag.id,portionId:''}}:{})});
      jump(inBrew?'brew':'bag/'+bag.id);
      return;
    }
    case 'portion': {
      const bag=getBag(key);
      const old=bag?.portions.find(p=>p.id===part);
      if(!bag) return;
      const refreeze=old&&page==='refreeze';
      const portion={...Object.fromEntries(['name','method','frozen','thawed'].map(k=>[k,clean(f,k)])),
        id:old?.id??id(),events:[...(old?.events??[])]};
      if(!portion.name) throw new Error('Enter a portion name.');
      if(refreeze){
        if(!old.frozen || !old.thawed || !portion.frozen || age(old.thawed,portion.frozen)===null) throw new Error('Finish the earlier freeze and thaw dates, then enter a new freeze date on or after the prior thaw.');
        portion.events.push({frozen:old.frozen,thawed:old.thawed});
      } else if(portion.events.length && (!portion.frozen || age(portion.events.at(-1).thawed,portion.frozen)===null)){
        throw new Error('The current freeze date must be on or after the previous thaw.');
      }
      const issue=storageDateError(portion,bag);
      if(issue) throw new Error(issue);
      const portions=old?bag.portions.map(p=>p.id===part?portion:p):[...bag.portions,portion];
      await commit({bags:state.bags.map(b=>b.id===bag.id?{...bag,portions,updatedAt:new Date().toISOString()}:b)});
      jump('bag/'+bag.id);
      return;
    }
    case 'shot-edit': {
      const old=getShot(key);
      if(!old) return;
      const taste=tasteFrom(f);
      const actual=actualFrom(f);
      if(actual.seconds!==null){
        if(old.actual.seconds!==actual.seconds||old.actual.timing!==actual.timing) actual.timeSource='manual';
        else if(measuredShotTime(old.actual)) actual.timeSource=old.actual.timeSource;
      }
      const shot={...old,...taste,detail:'',actual,updatedAt:new Date().toISOString()};
      const revised=evaluateEspresso({...shot,answers:{taste:shot.tastes[0],flow:shot.flows[0]},bag:shot.bag,previous:getShot(shot.parentId)});
      shot.advice=revised.kind==='question'?{title:'A follow-up would help',change:revised.title,keep:'Keep your recipe steady while checking.',watch:'Use Troubleshoot for the guided follow-up.',why:revised.body??''}:revised;
      await commit({shots:state.shots.map(s=>s.id===key?shot:s)});
      jump('shot/'+key);
      return;
    }
    case 'chat': {
      const output=node.querySelector('#chat-reply');
      const message=clean(f,'message');
      if(!message) throw new Error('Enter a message.');
      output.textContent='Connecting…';
      try {
        const session=activeSession();
        const context = f.has('include') ? shotContext({...coachingRecord(session),advice:coachOutcome(session)},getBag(session.bagId)) : null;
        output.textContent=await sendChat(message,context);
      } catch(err) {
        output.textContent='';
        throw err;
      }
      return;
    }
    case 'drink-filter': refreshDrinks(node);return;
    case 'recipe-link': {
      try {
        importSource=recipeURL(clean(f,'url')).href;
        const submit=node.querySelector('[type="submit"]');
        submit.disabled=true;
        submit.textContent='Reading recipe…';
        const choices=await loadRecipeLink(importSource);
        if(!node.isConnected) return;
        if(choices.length===1) importDraft={...choices[0],imported:true};
        else importChoices=choices;
        render(true);
      } catch(cause){
        if(!node.isConnected) return;
        const submit=node.querySelector('[type="submit"]');
        submit.disabled=false;
        submit.textContent='Read recipe link';
        throw new Error(cause.message+' You can use Paste recipe text instead.');
      }
      return;
    }
    case 'recipe-text':
      importDraft={...parseRecipeText(clean(f,'recipeText'),importSource),imported:true};
      render(true);
      return;
    case 'recipe-edit': {
      if(!activeRecipe) return;
      const saved=state.recipes.find(r=>r.id===activeRecipe.id);
      const imported=activeRecipe.imported===true;
      const names=f.getAll('ingredient');
      const amounts=f.getAll('amount');
      const units=f.getAll('unit');
      const optional=[...node.querySelectorAll('[name="ingredient-optional"]')].map(el=>el.checked);
      const original=imported?clean(f,'originalURL'):'';
      const recipe={id:saved?.id??id(),name:clean(f,'name'),kind:clean(f,'kind'),description:clean(f,'description'),
        yieldText:clean(f,'yieldText'),...(imported?{imported:true,originalURL:original?recipeURL(original).href:''}:{}),
        swaps:clean(f,'swaps').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
        items:names.map((name,i)=>({name:name.trim(),amount:amounts[i]===''?null:Number(amounts[i]),
          unit:amounts[i]===''?'':units[i],optional:optional[i]})),
        steps:clean(f,'steps').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),favorite:saved?.favorite??false};
      if(!recipe.name || !recipe.items.length || recipe.items.some(i=>!i.name) || !recipe.steps.length) throw new Error('Add a recipe name, ingredients, and preparation steps.');
      if(recipe.items.some(i=>i.amount===null?!imported:!positive(i.amount,100000)||!recipeUnits.includes(i.unit))) {
        throw new Error('Choose a unit for every confirmed amount. Use Count for a number of whole items.');
      }
      await commit({recipes:saved?state.recipes.map(r=>r.id===recipe.id?recipe:r):[recipe,...state.recipes]});
      jump('recipe/'+recipe.id);
      return;
    }
    case 'import': {
      const file=f.get('backup');
      if(!file?.size || file.size>100000000) throw new Error('Choose a backup file under 100 MB.');
      let data;
      try { data=JSON.parse(await file.text()); } catch { throw new Error('This file is not valid backup JSON.'); }
      restoreCandidate=importData(data);
      const preview=document.createElement('div');
      preview.id='restore-preview';
      const r=restoreCandidate;
      preview.innerHTML=`<p>Replace your journal with ${r.bags.length} bags, ${r.shots.length} shots and ${r.recipes.length} recipes?</p>
      <button class="primary" type="button" data-action="confirm-restore">Restore backup</button>
      <button type="button" data-action="cancel-restore">Cancel restore</button>`;
      node.querySelector('#restore-preview')?.remove();
      node.append(preview);
      preview.querySelector('button').focus();
      return;
    }
    default:return;
  }
  render();
}
async function doAction(el){
  const name=el.dataset.action;
  const key=el.dataset.value;
  const stateDraft=state.draft;
  switch(name){
    case 'brew-step': {
      const step=Number(key);
      if(!stateDraft||!Number.isInteger(step)||step<1||step>7) return;
      await commitDraft({step});
      break;
    }
    case 'start-quick':
      quickPouring={gear:{...state.equipment},planned:startingRecipe(state.equipment,null,'Balanced')};
      render(true);return;
    case 'open-brew-editor': {
      const dialog=main.querySelector(`dialog[data-editor="${key}"]`);
      dialog.querySelector('form').reset();
      dialog.showModal();
      dialog.querySelector('input').focus();
      dialog.querySelector('input').select();
      return;
    }
    case 'close-brew-editor':
      el.closest('dialog').close();
      return;
    case 'start-brew-timer': {
      const draft=currentPour();
      if(!draft||draft.shotClock||!validTimerTarget(draft.planned?.targetSeconds)) return;
      await updatePour({shotClock:{startedAt:Date.now()}});
      updateBrewTimer('[data-action="stop-brew-timer"]');
      return;
    }
    case 'skip-brew-timer': {
      const draft=currentPour();
      if(!draft||draft.shotClock||draft.decorativeStartedAt!=null) return;
      await updatePour({decorativeStartedAt:Date.now()});
      updateBrewTimer('[data-action="finish-pour"]');
      return;
    }
    case 'stop-brew-timer': {
      const clock=currentPour()?.shotClock;
      if(!clock||clock.stoppedAt!=null) return;
      await updatePour({shotClock:{...clock,stoppedAt:Date.now()}});
      updateBrewTimer('[data-action="finish-pour"]');
      return;
    }
    case 'confirm-shot-time': {
      const session=activeSession();
      if(session.screen!=='confirm-timer') return;
      if(key==='use'){
        session.actual={...session.actual,seconds:session.timerReading,timing:'start',timeSource:'timer'};
      }else session.answers.noTime=true;
      session.screen=session.origin?.test?'test-result':'start';
      await finishCoachStep();
      return;
    }
    case 'make-brewed-drink':
      if(currentPour()) jump('brew-drinks/'+route()[0]);
      return;
    case 'finish-pour': await finishPour(route()[0]==='timer');return;
    case 'coach-clear-time': {
      const session=activeSession();
      rememberCoachStep(session);
      const {timeSource,...actual}=session.actual;
      session.actual={...actual,seconds:null,timing:'unknown'};
      delete session.answers.interruption;
      session.answers.noTime=true;
      session.question=null;
      session.undone=false;
      await finishCoachStep();return;
    }
    case 'coach-checked-clean': {
      const session=activeSession();
      updateCoachAnswer(session.answers,'basketCondition','clean');
      session.question=null;
      session.undone=false;
      await finishCoachStep();return;
    }
    case 'plan-without-gear': {
      const goal=clean(new FormData(el.form),'goal');
      await commitDraft({step:3,goal,gear:{...state.equipment},planned:planFor({...state.draft,goal},state.equipment)});
      break;
    }
    case 'skip-equipment':
      await commit({equipmentSetupSkipped:true});
      jump('home');
      return;
    case 'undo-planned-change':
      await commitDraft({planned:stateDraft.coachUndo,coachUndo:null,test:null});
      break;
    case 'equipment-edit':
      editingEquipment=true;
      render();
      main.querySelector('form[data-form="gear"] button, form[data-form="brew-gear"] button')?.focus();
      return;
    case 'equipment-cancel':
      editingEquipment=false;
      render();
      main.querySelector('[data-action="equipment-edit"]')?.focus();
      return;
    case 'offline-retry': void checkOffline(); return;
    case 'coach-answer': {
      const session=activeSession();
      const question=session.screen==='evaluate'?displayedOutcome(session):null;
      runCoachAnswer(session,key);
      const capability=question?.key;
      try {
        if(storageReady && Object.hasOwn(equipmentQuestions,capability) &&
           EQUIPMENT[capability].includes(key) && state.equipment[capability]!==key){
          await commit({equipment:coachGear(state.equipment,{[capability]:key})});
        }
      } finally { await finishCoachStep(); }
      return;
    }
    case 'coach-undo': activeSession().undone=true;await finishCoachStep();return;
    case 'coach-back': previousCoachStep(activeSession());await finishCoachStep();return;
    case 'coach-edit': {
      const session=activeSession();
      rememberCoachStep(session);
      session.screen='edit';
      session.question=null;
      await finishCoachStep();return;
    }
    case 'coach-report': case 'coach-edit-item':
      editCoachItem(activeSession(),key);await finishCoachStep();return;
    case 'coach-save': await saveCoachResult(activeSession());await finishCoachStep();return;
    case 'coach-try': await useCoachRecipe(activeSession());return;
    case 'new-shot': case 'repeat': {
      if((unfinishedShot(stateDraft)||unfinishedCoach()||quickPouring) &&
        !window.confirm('Start a new shot? Your unfinished attempt will be discarded.')) return;
      const coffee=route()[0]==='coach'?activeSession():stateDraft;
      await commit({draft:newDraft(getShot(key),coffee)});
      directCoach=null;
      brewCoach=null;
      quickPouring=null;
      jump('brew');
      return;
    }
    case 'archive-bag': {
      await commit({bags:state.bags.map(b=>b.id===key?{...b,archived:!b.archived,updatedAt:new Date().toISOString()}:b)});
      break;
    }
    case 'delete-bag': {
      if(!window.confirm('Delete this bag and its label photo? Existing shots will keep their recorded bean details.')) return;
      await commit({bags:state.bags.filter(b=>b.id!==key),
        shots:state.shots.map(s=>s.bagId===key?{...s,bagId:'',portionId:'',updatedAt:new Date().toISOString()}:s),
        draft:stateDraft?.bagId===key?{...stateDraft,bagId:'',portionId:''}:stateDraft});
      jump('beans');
      return;
    }
    case 'refreeze': jump('refreeze/'+key); return;
    case 'favorite-shot':
      await commit({shots:state.shots.map(s=>s.id===key?{...s,favorite:!s.favorite,updatedAt:new Date().toISOString()}:s)});
      break;
    case 'delete-shot': {
      if(!window.confirm('Delete this shot from your history?')) return;
      selection.delete(key);
      await commit({shots:state.shots.filter(s=>s.id!==key).map(s=>s.parentId===key?{...s,parentId:'',updatedAt:new Date().toISOString()}:s),
        draft:stateDraft?.parentId===key?{...stateDraft,parentId:''}:stateDraft});
      jump('history');
      return;
    }
    case 'compare':
      if(selection.size<2) return toast('Select two shots to compare.');
      jump('compare');
      return;
    case 'recipe-import-choose': {
      const candidate=importChoices[Number(key)];
      if(candidate) importDraft={...candidate,imported:true};
      render(true);
      return;
    }
    case 'recipe-import-back':
      if(importDraft) importDraft=null;
      else importChoices=[];
      render(true);
      return;
    case 'favorite-recipe': {
      const [page,where]=route();
      const fromCup=['brew-drink','brew-drinks'].includes(page);
      const saved=state.recipes.find(r=>r.id===key);
      const picks=fromCup?brewedDrinkChoices(state.recipes,drinkOptions):null;
      const recipe=saved??(fromCup?picks.suggestions.find(r=>r.id===key):getRecipe(key));
      if(!recipe) return;
      const {missing,unchecked,...base}=recipe;
      const next={...base,id:saved?key:id(),favorite:!recipe.favorite};
      await commit({recipes:saved?state.recipes.map(r=>r.id===key?next:r):[next,...state.recipes]});
      if(page==='brew-drinks') render();
      else jump(page==='brew-drink'?'brew-drink/'+where+'/'+next.id:'recipe/'+next.id);
      return;
    }
    case 'delete-recipe':
      if(!window.confirm('Delete this saved recipe?')) return;
      await commit({recipes:state.recipes.filter(r=>r.id!==key)});
      jump('recipes');
      return;
    case 'add-ingredient':
      main.querySelector('#ingredient-rows').insertAdjacentHTML('beforeend',view.ingredientRow({},activeRecipe?.imported));
      main.querySelector('#ingredient-rows > :last-child input').focus();
      return;
    case 'remove-ingredient': {
      const rows=main.querySelector('#ingredient-rows');
      if(rows.children.length===1) return toast('Keep at least one ingredient.');
      el.closest('.ingredient-row').remove();
      main.querySelector('[data-action="add-ingredient"]').focus();
      return;
    }
    case 'remove-photo': {
      photoRequest++;
      photoDraft='';
      const node=el.closest('form');
      updatePhoto('',node);
      node.querySelector('button[type="submit"]').disabled=false;
      node.querySelector('#take-photo-input').focus();
      return;
    }
    case 'apply-label': {
      const node=el.closest('form');
      for(const checkbox of node.querySelectorAll('input[name="ocr-field"]:checked')){
        const field=node.elements[checkbox.value];
        if(field){
          field.value=ocrDraft?.[checkbox.value]??'';
          if(field.matches('select')){
            field.closest('.selection').querySelector('.selection-trigger span').textContent=field.selectedOptions[0]?.textContent??'Not specified';
          }
          if(field.closest('details')) field.closest('details').open=true;
        }
      }
      node.querySelector('#label-status').textContent='Checked details added. Review and save when ready.';
      return;
    }
    case 'export': exportBackup(); return;
    case 'confirm-restore':
      if(!restoreCandidate) return;
      await commit(restoreCandidate);
      restoreCandidate=null;
      selection.clear();
      directCoach=null;
      brewCoach=null;
      toast('Backup restored.');
      break;
    case 'cancel-restore':
      restoreCandidate=null;
      el.closest('#restore-preview').remove();
      main.querySelector('[data-form="import"] button').focus();
      return;
    default:return;
  }
  render();
}
function refreshDrinks(form) {
  const f=new FormData(form);
  const next={...drinkOptions,...Object.fromEntries(['temp','milk','sweet','strength','otherSyrup'].map(k=>[k,clean(f,k)])),pantry:f.getAll('pantry')};
  const effectiveMilk=milkFor(next.milk,next.diet);
  if(next.milk!=='No preference'&&next.milk!==effectiveMilk){
    const field=form.elements.milk;
    field.value=effectiveMilk;
    field.parentElement.querySelector('.selection-trigger span').textContent=effectiveMilk;
    next.milk=effectiveMilk;
  }
  if(effectiveMilk!==milkFor(drinkOptions.milk,drinkOptions.diet)){
    form.querySelector('[name="pantry"][value="milk"]').checked=false;
    next.pantry=next.pantry.filter(key=>key!=='milk');
  }
  drinkOptions=next;
  try { localStorage.setItem('morning-pull-drinks',JSON.stringify(drinkOptions)); } catch {}
  main.querySelector('#drink-suggestions').innerHTML=view.drinkSuggestions(drinkOptions);
  main.querySelector('#saved-drinks').innerHTML=view.savedDrinkCards(state.recipes,drinkOptions);
  main.querySelector('#drink-update').textContent=`${drinkOptions.temp} drink suggestions updated.`;
}
async function changed(el){
  const f=el.closest('form');
  switch(el.dataset.refresh){
    case 'bag': {
      await commitDraft({bagId:el.value,portionId:''});
      render();
      main.querySelector('select[name="bagId"]')?.closest('.selection')?.querySelector('button')?.focus();
      return;
    }
    case 'compare':
      if(el.checked && selection.size>=2){el.checked=false;return toast('Choose up to two shots at a time.');}
      if(el.checked) selection.add(el.value); else selection.delete(el.value);
      return;
  }
}
async function selectBagPhoto(input) {
  const file=input.files?.[0];
  if(!file) return;
  input.value='';
  const form=input.form;
  const request=++photoRequest;
  const status=form.querySelector('#photo-status');
  const save=form.querySelector('button[type="submit"]');
  save.disabled=true;
  status.textContent='Opening photo…';
  try {
    const photo=await photoFor(file);
    if(!form.isConnected||request!==photoRequest) return;
    photoDraft=photo;
    updatePhoto(photo,form);
  } catch(error) {
    if(form.isConnected&&request===photoRequest){
      status.textContent=error.message==='Choose an image under 24 MB.'?error.message:
        'This photo could not be opened. Try a JPEG or PNG, or enter the label details below.';
    }
  } finally {
    if(form.isConnected&&request===photoRequest) save.disabled=false;
  }
}
const coachProgress = ({screen,actual,answers,undone,note,question,trail,noteKind,noteKey,noteChoice,bagId,portionId}) => structuredClone({
  screen,actual,answers,undone,note,question,trail,noteKind,noteKey,noteChoice,
  bagId,portionId
});
async function persistBrewCoach(){
  if(!brewCoach||brewCoach.origin!==state.draft) return;
  const coach=coachProgress(brewCoach);
  if(JSON.stringify(coach)===JSON.stringify(state.draft.coach)) return;
  await commitDraft({coach});
  brewCoach.origin=state.draft;
}
async function finishCoachStep(){
  if(route()[0]==='brew'&&storageReady) await persistBrewCoach();
  render(true);
}
async function perform(work,node) {
  if(busy) return;
  busy=true;
  error(node,'');
  try { await work(); }
  catch(err) { if(node?.querySelector('.error')) error(node,err.message); else toast(err.message); }
  finally { busy=false; }
}
main.addEventListener('submit',event=>{
  event.preventDefault();
  const node=event.target;
  void perform(()=>submitForm(node),node);
});
main.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');
  if(button?.dataset.action==='read-label'){
    if(!button.disabled) void readLabel(button);
    return;
  }
  if(button) void perform(()=>doAction(button),button.closest('form'));
});
main.addEventListener('change',event=>{
  const el=event.target;
  if(el.matches('[data-photo-picker]')) { void selectBagPhoto(el); return; }
  if(el.closest('form')?.dataset.form==='drink-filter') refreshDrinks(el.form);
  if(el.dataset.refresh) void perform(()=>changed(el),el.closest('form'));
});
main.addEventListener('cancel',event=>{
  if(!event.target.matches('[data-photo-picker]')) return;
  event.target.form.querySelector('#photo-status').textContent='No new photo selected.';
},true);
main.addEventListener('input',event=>{
  const node=event.target.closest('form');
  if(!node) return;
  const task=node.dataset.form;
  if(task==='calculator') refreshCalculation(node);
  if(task==='brew-plan'){
    const f=new FormData(node);
    const d=numeric(f,'dose');
    const targetField=node.elements.cupTarget;
    if(event.target.name==='dose'&&targetField){
      const original=state.draft.planned;
      if(targetField.value===node.dataset.lastSuggestedTarget||node.dataset.lastSuggestedTarget===undefined&&targetField.value===measure(targetYield(original.dose,original.ratio)).replace('—','')){
        const next=positive(d,60)?measure(targetYield(d,original.ratio)):'';
        targetField.value=next;
        node.dataset.lastSuggestedTarget=next;
      }
    }
    const cup=numeric(new FormData(node),'cupTarget');
    const draft=state.draft;
    const plan={...draft.planned,dose:positive(d,60)?d:null,ratio:ratioOf(d,cup)??draft.planned.ratio};
    node.querySelector('[data-planned-metrics]').innerHTML=planDisplay(plan,draft.gear);
    const doseNote=node.querySelector('[data-dose-note]');
    if(doseNote) doseNote.textContent=plan.dose?'The target dose is a suggested starting point. Use a dose that fits your basket.':
      'Basket capacity is unknown. Enter a dose that fits your basket.';
    const doseStep=node.querySelector('[data-prep-label="dose"]');
    if(doseStep) doseStep.textContent=prepSteps(draft.gear,plan).find(([key])=>key==='dose')[1];
  }
  if(task==='recipe-scale' && activeRecipe){
    const amount=numeric(new FormData(node),'multiplier');
    node.querySelector('#recipe-items').innerHTML=positive(amount,100)?view.recipeItems(scaleItems(activeRecipe.items,amount)):'<p>Enter a positive batch multiplier up to 100.</p>';
  }
});
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installEvent=event;
  install.hidden=false;
});
window.addEventListener('appinstalled',()=>{installEvent=null;install.hidden=true;});
install.addEventListener('click',async()=>{
  if(!installEvent) return;
  await installEvent.prompt();
  installEvent=null;
  install.hidden=true;
});
document.querySelector('.skip').addEventListener('click',event=>{event.preventDefault();main.focus();main.scrollIntoView();});

try{
  state=await load();
  storageReady=true;
}catch {
  toast('Browser storage is unavailable. Unsaved tools can still run.');
}
enableSelection(main);
window.addEventListener('hashchange',()=>void enter());
await enter();
function showOfflineStatus() {
  const status=main.querySelector('#offline-status');
  if(!status) return;
  status.textContent=offlineMessages[offlineStatus];
  const retry=main.querySelector('[data-action="offline-retry"]');
  retry.hidden=['pending','ready'].includes(offlineStatus);
}
async function checkOffline() {
  offlineStatus='pending';
  showOfflineStatus();
  offlineStatus=await prepareOffline();
  showOfflineStatus();
}
void checkOffline();
