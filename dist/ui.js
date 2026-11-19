import {selection} from './selection.js';
import {EQUIPMENT,TIMING,TASTES,FLOWS,age,round,ratioOf,targetYield,extraction,isCapsule,prepSteps,recipeReason,positive,validTimerTarget,shotClock} from './core.js';
export const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const eq = (value,other) => value === other ? ' selected' : '';
export const checked = value => value ? ' checked' : '';
export const heading = (title,sub = '') => `<div><h1>${e(title)}</h1>${sub ? `<p class="muted">${e(sub)}</p>`:''}</div>`;
export const btn = (label,action,value='',style='') => `<button type="button" class="${style}" data-action="${action}" data-value="${e(value)}">${e(label)}</button>`;
export const link = (label,address,style='') => `<a class="button ${style}" href="#${e(address)}">${e(label)}</a>`;
export const submit = label => `<button type="submit" class="primary">${e(label)}</button>`;
export const actions = content => `<div class="actions">${content}</div>`;
export const fields = content => `<div class="fields">${content}</div>`;
export const panel = (content,classes='') => `<section class="panel ${classes}">${content}</section>`;
export const form = (name,content) => `<form data-form="${name}">${content}<p class="error" role="alert" hidden></p></form>`;
export const input = (label,name,value='',attrs='') => `<label class="label">${e(label)}<input name="${name}" value="${e(value)}" ${attrs}></label>`;
export const number = (label,name,value='',attrs='') => input(label,name,value,`type="number" inputmode="decimal" step="any" ${attrs}`);
export const textarea = (label,name,value='') => `<label class="label">${e(label)}<textarea name="${name}" maxlength="3000">${e(value)}</textarea></label>`;
export const select = selection;
export const checks = (legend,name,values,selected) => `<fieldset><legend>${e(legend)}</legend><div class="checks">${values.map(value=>{
  const [key,caption] = Array.isArray(value) ? value : [value,value];
  return `<label><input type="checkbox" name="${name}" value="${e(key)}"${checked(selected.includes(key))}>${e(caption)}</label>`;
}).join('')}</div></fieldset>`;
export const details = (label,content,open=false) => `<details${open?' open':''}><summary>${e(label)}</summary>${content}</details>`;
export const bagName = bag => [bag?.roaster,bag?.name].filter(Boolean).join(' · ') || 'Untracked beans';
export const measure = (v,unit='') => v===null || v===undefined ? '—' : round(v)+(unit?' '+unit:'');
export const displayRatio = v => v===null ? '—' : '1 : '+round(v);
export const metric = entries => `<dl class="metric">${entries.map(([key,val])=>`<div><dt>${e(key)}</dt><dd>${e(val)}</dd></div>`).join('')}</dl>`;
export const error = (node,message) => {
  const alert = node?.querySelector('.error');
  if (!alert) return;
  alert.hidden = !message;
  alert.textContent = message;
};
export const gearLabels = {machine:'Machine type',warmup:'Does your machine’s manual recommend a warming flush?',grinder:'Grinder',basket:'Basket',scale:'Scale available?',timer:'Timing device',stop:'Brew stop control',temperature:'Temperature control',infusion:'Pre-infusion control',tamper:'Tamper available?',distribution:'Distribution tools'};
const gearSelect = (gear,key) => select(gearLabels[key],key,gear[key] ?? 'Not sure',EQUIPMENT[key]);
export const gearForm = gear => fields(['machine','grinder','basket','scale','stop'].map(k=>gearSelect(gear,k)).join('')+
  number('Basket’s rated dose (g, if known)','ratedDose',gear.ratedDose,'min=".1" max="60"'))+
  details('More equipment details',fields(['temperature','infusion','tamper','distribution','warmup'].map(k=>gearSelect(gear,k)).join('')),['temperature','infusion','tamper','distribution','warmup'].some(k=>gear[k] && gear[k]!=='Not sure'));
const setupChoices = {
  machine:[['Not sure','Not sure'],['Pump espresso machine','Pump machine with a removable handle'],['Manual lever','Manual lever machine'],
    ['Automatic / bean-to-cup','Automatic machine that grinds and brews'],['Capsule machine','Capsule machine']],
  grinder:[['Not sure','Not sure'],['Adjustable espresso grinder','I can adjust how fine it grinds'],['Fixed or limited grinder','Fixed or limited settings'],
    ['Pre-ground coffee','I use pre-ground coffee'],['Built-in or automated','The machine handles it']]
};
export const equipmentSetupForm = gear => fields(
  select('What kind of machine do you use?','machine',gear.machine,setupChoices.machine)+
  select('How do you grind your coffee?','grinder',gear.grinder,setupChoices.grinder)+
  select('Can you choose when to stop the shot?','stop',gear.stop,[['Not sure','Not sure'],
    ['Can stop at a chosen yield','Yes, I can stop it'],['Preset or automatic only','It stops automatically']])+
  select('Can you weigh the espresso?','scale',gear.scale,[['Not sure','Not sure'],['Yes','Yes, I have a scale'],['No','No scale']]))+
  details('Basket and other controls',fields(gearSelect(gear,'basket')+
    number('Basket’s rated dose (g, if known)','ratedDose',gear.ratedDose,'min=".1" max="60"')+
    ['temperature','infusion','tamper','distribution','warmup'].map(k=>gearSelect(gear,k)).join('')));
export const unfinishedShot = draft => Boolean(draft && draft.step<8 && !draft.savedId);
export const shotNavigation = () => actions(btn('Start over','new-shot','','ghost')+link('Dashboard','home','ghost'));
const trialInstructions = test => test ? `<div class="note"><strong>${e(test.title)}</strong><p>${e(test.instruction)}</p>${test.keep?`<p class="small">${e(test.keep)}</p>`:''}</div>` : '';
export const hasEquipment = gear => Object.keys(gear).length>0;
export function equipmentSummary(gear) {
  const entries=['machine','grinder','basket'].map(k=>gear[k]).filter(v=>v&&v!=='Not sure');
  if(gear.ratedDose) entries.push(measure(gear.ratedDose,'g')+' basket');
  if(gear.scale==='Yes') entries.push('Scale');
  if(gear.scale==='No') entries.push('No scale');
  return `<div class="row equipment-summary"><div><strong>Saved equipment</strong><p class="small">${e(entries.join(' · ')||'Most capabilities are still unknown.')}</p></div>${btn('Edit','equipment-edit','','ghost')}</div>`;
}
export const advicePanel = advice => `<h2>${e(advice.title)}</h2><p>${e(advice.change)}</p><p class="small">${e(advice.keep)}</p><p class="small">${e(advice.watch)}</p>${details('Why?',`<p class="small">${e(advice.why)}</p>`)}`;
export const ageLine = (bag,on) => {
  const roastAge=age(bag.roast,on);
  const openedAge=age(bag.opened,on);
  return [roastAge===null?'Roast date unknown':`${roastAge} ${roastAge===1?'day':'days'} since roast`,openedAge===null?'Opening date unrecorded':`${openedAge} ${openedAge===1?'day':'days'} since opening`].join(' · ');
};
export function planDisplay(plan,gear) {
  const items=[['Target dose',measure(plan.dose,'g')],['Target yield',measure(targetYield(plan.dose,plan.ratio),'g')],['Brew ratio',isCapsule(gear)?'—':displayRatio(plan.ratio)]];
  if(validTimerTarget(plan.targetSeconds)) items.push(['Target time',measure(plan.targetSeconds,'s')]);
  if(plan.temperature!==null) items.push(['Temperature',measure(plan.temperature,'°C')]);
  if(plan.preInfusion!==null) items.push(['Pre-infusion',measure(plan.preInfusion,'s')]);
  return metric(items);
}
export function resultDisplay(actual) {
  return metric([['Actual dose',measure(actual.dose,'g')],['Actual yield',measure(actual.yieldG,'g')],['Brew ratio',displayRatio(ratioOf(actual.dose,actual.yieldG))],
    ['Shot time',measure(actual.seconds,'s')],['Measured TDS',measure(actual.tds,'%')],['Extraction yield',measure(extraction(actual.dose,actual.yieldG,actual.tds),'%')]]);
}
export const tasteFields = o => checks('Taste','taste',TASTES,o.tastes)+checks('Flow','flow',FLOWS,o.flows)+fields(
 select('Taste rating','rating',String(o.rating ?? ''),[['','Optional'],['1','1 · Disliked'],['2','2'],['3','3'],['4','4'],['5','5 · Excellent']])+
 input('Other taste or observations','note',o.note,'maxlength="350"'));
export const measurementFields = (a,timing) => fields(number('Dry dose (g)','dose',a.dose,'min=".1" max="60"')+
 number('Espresso yield (g)','yieldG',a.yieldG,'min=".1" max="500"')+
 number('Shot time (s)','seconds',a.seconds,'min=".1" max="3600"')+
 select('Timing convention','timing',a.timing || timing,Object.entries(TIMING)))+
 details('Measured TDS',`<p class="small">Total dissolved solids (TDS) is the concentration measured with a coffee refractometer. For 9% TDS, enter 9.</p>`+
   number('Measured TDS (%)','tds',a.tds,'min=".001" max="100"'),a.tds!==null && a.tds!==undefined);

function prepChecklist(draft,planned,editable=true){
  const steps=prepSteps(draft.gear,planned);
  return `<fieldset class="prep-list"><legend>Puck preparation</legend>${steps.map(([key,label,hint])=>
    `<label><input type="checkbox" name="prep" value="${key}"${checked(draft.prepChecked?.includes(key))}${editable?'':' disabled'}>
    <span><span data-prep-label="${key}">${e(label)}</span>${hint?`<small>${e(hint)}</small>`:''}</span></label>`).join('')}</fieldset>`;
}
const go = value => btn(value===1?'Back to beans':'Back','brew-step',value,'ghost');
const titles=['Choose your beans','Set up your shot','Suggested recipe'];

export function brewView(draft,state,editingEquipment=false) {
  const {planned}=draft;
  const gear=draft.step===2?state.equipment:draft.gear;
  if(draft.step===5 && (draft.pouring||draft.timer?.startedAt!=null)) return pourView(draft);
  const step=[4,5].includes(draft.step)?3:draft.step;
  const bag=state.bags.find(b=>b.id===draft.bagId);
  const portion=bag?.portions.find(p=>p.id===draft.portionId);
  const parent=state.shots.find(s=>s.id===draft.parentId);
  const previous=parent ?? state.shots.find(s=>s.id!==draft.savedId && s.bagId && s.bagId===draft.bagId);
  let body='';
  if(step===1){
    const options=state.bags.filter(b=>!b.archived || b.id===draft.bagId).map(b=>[b.id,bagName(b)]);
    body=form('brew-bean',select('Bean bag','bagId',draft.bagId,[['','Brew without tracking a bag'],...options], 'data-refresh="bag"')+
      (bag?.portions.length ? select('Storage portion','portionId',draft.portionId,[['','Main bag'],...bag.portions.map(p=>[p.id,p.name])]):'')+
      actions(submit('Continue')+link('Add a bean bag','bag-new/brew','ghost')));
  }else if(step===2){
    const hasSetup=hasEquipment(gear);
    const editing=editingEquipment||!hasSetup;
    body=form('brew-gear',
      (editing?gearForm(gear)+actions(submit('Save equipment')):equipmentSummary(gear))+
      select('Taste goal','goal',draft.goal,['Balanced','More body','More clarity'])+
      actions((editing?(hasSetup?btn('Cancel equipment edit','equipment-cancel','','ghost'):btn('Plan recipe without equipment details','plan-without-gear','','ghost')):submit('Plan recipe'))+go(1)));
  }else if(step===3){
    const guidance=[planned.grind,planned.prep,planned.heat].filter(Boolean);
    const preparation=prepChecklist(draft,planned);
    const suggestedDose=!isCapsule(gear)&&!positive(gear.ratedDose,60);
    const recipeInputs=(!isCapsule(gear)?fields(number('Planned dose (g)','dose',planned.dose,'min=".1" max="60"')+
      number('Planned cup target (g)','cupTarget',planned.dose?measure(targetYield(planned.dose,planned.ratio)):null,'min=".1" max="500"')):'')+
      (gear.temperature==='Adjustable'?number('Temperature (°C)','temperature',planned.temperature,'min="70" max="105"'):'');
    body=trialInstructions(draft.test)+(!draft.test&&guidance.length?`<p class="note">${guidance.map(e).join(' ')}</p>`:'')+
      form('brew-plan',`<div data-planned-metrics>${planDisplay(planned,gear)}</div>`+
      (!isCapsule(gear)?`<p class="small">${e(recipeReason(planned))} The cup target is the dose multiplied by the ratio.</p>`:'')+
      (suggestedDose?`<p class="small" data-dose-note>${planned.dose?'The target dose is a suggested starting point. Use a dose that fits your basket.':'Basket capacity is unknown. Enter a dose that fits your basket.'}</p>`:'')+
      preparation+(recipeInputs?details('Recipe settings',recipeInputs,suggestedDose):'')+
      actions(submit('Start brewing')+(draft.coachUndo?btn('Undo','undo-planned-change','','ghost'):'')+(draft.test?link('My equipment','equipment/brew','ghost'):go(2))));
  }else{
    body=`<p>Your results are in History.</p>`+actions(link('Open shot','shot/'+draft.savedId,'primary')+btn('Pull another shot','new-shot',draft.savedId)+link('Dashboard','home','ghost'));
  }
  const title=step===3&&draft.test?'Test shot recipe':titles[step-1]||'Shot saved';
  return `<div class="brew-layout">${panel(`<h1>${title}</h1>${body}${step<8?shotNavigation():''}`,'guide')}
    <aside class="stack aside">
      ${bag?panel(`<h2>${e(bagName(bag))}</h2><p class="small">${bag.roastLevel?`${e(bag.roastLevel)} roast · `:''}${e(ageLine(bag))}${portion?` · ${e(portion.name)}`:''}</p>`):''}
      ${step>=3 && previous?panel(`<h2>Previous attempt</h2><p class="small">${e(previous.day)} · ${e(previous.tastes.join(', ')||'Taste unrecorded')}</p>
      ${previous.change?`<p class="small">Changed: ${e(previous.change)}</p>`:''}${link('View attempt','shot/'+previous.id,'ghost')}`):''}</aside></div>`;
}
function brewEditor(key,title,field){
  return `<dialog class="cafe-dialog brew-editor" data-editor="${key}" aria-labelledby="${key}-title">
    <div class="cafe-dialog-header"><h2 id="${key}-title">${title}</h2></div>
    <div class="dialog-body">${form(key,field+actions(submit('Save')+btn('Cancel','close-brew-editor','','ghost')))}</div></dialog>`;
}
export function brewControls(draft){
  const {planned,gear={}}=draft;
  const grams=targetYield(planned?.dose,planned?.ratio);
  const hasTarget=grams!==null&&!isCapsule(gear);
  return hasTarget?`<div class="row"><p class="pour-target">Target yield · ${measure(grams,'g')}</p>
    ${btn('Edit target yield','open-brew-editor','brew-yield','ghost')}</div>
    <p class="small">Target dose · ${measure(planned.dose,'g')} · Brew ratio ${displayRatio(planned.ratio)}</p>
    ${brewEditor('brew-yield','Edit target yield',number('Target espresso weight (g)','cupTarget',measure(grams),
      'min=".1" max="500" required'))}`:'';
}
export function brewTimer(draft){
  const duration=validTimerTarget(draft.planned?.targetSeconds)?draft.planned.targetSeconds:null;
  const clock=duration===null?null:shotClock(draft.shotClock,duration);
  const timing=clock?.running?btn('Stop timer','stop-brew-timer','','ghost'):
    !clock&&btn('Start timer',duration===null?'open-brew-editor':'start-brew-timer',duration===null?'brew-duration':'','primary');
  return `<div class="clock-display" aria-label="Optional shot timer">
    <strong data-countdown${clock&&!clock.running?' hidden':''}>${clock?clock.remaining+' s left':duration===null?'Shot timer':duration+' s'}</strong>
    ${clock?'<span data-elapsed></span>':''}
    </div><div class="clock-actions">${timing||''}
    ${!clock&&duration!==null?btn('Edit timer','open-brew-editor','brew-duration','ghost'):''}
    ${!clock&&draft.decorativeStartedAt==null?btn('Skip timer','skip-brew-timer','','ghost'):''}
    </div>
    ${clock?`<p class="timer-cue" role="status" data-clock-cue${clock.reached?'':' hidden'}>Check your yield</p>`:
      brewEditor('brew-duration','Timer duration',input('Target seconds','targetSeconds',duration??30,
        'type="number" inputmode="numeric" min="1" max="3600" step="1" required'))}`;
}
export function pourView(draft){
  return panel(heading('Brewing')+`<div class="pour-scene">
    <div class="brew-clock" data-brew-timer>${brewTimer(draft)}</div>
    <div class="pour-art" aria-hidden="true"><div class="mp-window"></div><div class="mp-lamp"></div>
    <div class="mp-brewer"><div class="mp-backplate"></div><div class="mp-copper"></div><div class="mp-head"></div>
    <div class="mp-cup-handle"></div><div class="mp-cup"></div><div class="mp-stream"></div><div class="mp-tray"></div></div></div></div>
    <div data-brew-controls>${brewControls(draft)}</div>
    ${trialInstructions(draft.test)}
    ${draft.test?`<p class="small" data-edited-target${draft.targetEdited?'':' hidden'}>The target above reflects your edit. The coach’s original suggestion is shown for reference.</p>`:''}
    ${actions(btn('Ready to taste','finish-pour','','primary')+btn('Make a drink','make-brewed-drink','','ghost'))}
    ${draft.prepChecked?.length?details('Prep checklist',prepChecklist(draft,draft.planned,false)):''}${shotNavigation()}`,'pour-panel');
}
