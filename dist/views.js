import {TIMING,round,TASTES,FLOWS} from './core.js';
import {SYRUPS,STORAGE_GUIDANCE,PANTRY,FLAVORS,MILK_PREFERENCES,drinks,matchImportedRecipe,matchesDrinkPreference,drinkAdditions} from './recipes.js';
import {e,heading,btn,link,submit,actions,fields,panel,form,input,number,textarea,select,checks,details,bagName,measure,displayRatio,ageLine,gearForm,equipmentSetupForm,hasEquipment,unfinishedShot,equipmentSummary,resultDisplay,planDisplay,tasteFields,measurementFields,advicePanel,pourView} from './ui.js';

import {offlineMessages} from './offline.js';
import {APP_VERSION} from './version.js';
import {recipeUnits} from './recipe-import.js';

export const methods = ['Unknown','Original bag','Sealed container','Vacuum sealed','Freezer','Other'];
export const defaultDrink = {temp:'Iced',milk:'No preference',diet:'Any milk',sweet:'Light',strength:'Regular',pantry:['espresso','water','ice'],otherSyrup:''};
export const freshTaste = () => ({tastes:[],flows:[],rating:null,note:'',detail:'',change:''});

export function home(state,continueCoach=false) {
  const tiles=[
    ['Quick brew','Start a pour without the recipe walkthrough.','timer'],
    ['Troubleshoot','Find one thing to try on the next shot.','coach'],
    ['Brew calculator','Check your ratio, yield, or extraction.','calculator'],
    ['Bean library','Track bags, roast dates, and storage.','beans'],
    ['Shot history','Compare attempts or repeat a favorite.','history'],
    ['Café recipes','Make syrups and drinks with what you have.','recipes']
  ];
  return `<section class="hero"><div class="hero-art" aria-hidden="true"><img src="./cafe.webp" width="1440" height="576" alt=""></div><div class="hero-content"><p class="kicker">Your home espresso coach</p><h1>Dial in your next shot.</h1><p>Choose a recipe for your beans, pull a shot, and figure out what to try next.</p>${actions(btn('Start a new shot','new-shot','','primary')+
    (unfinishedShot(state.draft)||continueCoach?link('Continue current shot',unfinishedShot(state.draft)?'brew':'coach','ghost'):'')+
    link('My equipment','equipment','ghost'))}</div></section>
  ${!hasEquipment(state.equipment??{})&&!state.equipmentSetupSkipped?panel(`<h2>Set up your equipment</h2>
    <p class="small">Tell the coach what you use and what you can adjust.</p>${actions(link('Set up equipment','equipment','primary')+
    btn('Skip for now','skip-equipment','','ghost'))}`,'section-gap'):''}
  <div class="tiles section-gap">${tiles.map(([name,desc,route])=>`<a class="panel" href="#${route}"><strong>${name}</strong><span class="small">${desc}</span></a>`).join('')}</div>`;
}
export function equipmentView(gear,returnPage){
  const back=returnPage==='brew'?'brew':'home';
  return panel(heading('My equipment','Answer what you know so the coach can suggest changes that fit your setup.')+
    form('gear',equipmentSetupForm(gear)+actions(submit('Save equipment')+
      (hasEquipment(gear)||back==='brew'?link('Cancel',back,'ghost'):btn('Skip for now','skip-equipment','','ghost')))));
}
export function beansView(state,showArchived=false) {
  const bags=state.bags.filter(b=>b.archived===showArchived);
  return `<div class="panel-header">${heading('Bean library')}${link('Add a bean bag','bag-new','primary')}</div>
   ${actions(link(showArchived?'Active bags':'Archived bags',showArchived?'beans':'beans-archived','ghost'))}
   <div class="grid section-gap">${bags.map(b=>panel(`<h2><a href="#bag/${e(b.id)}">${e(bagName(b))}</a></h2><p class="small">${e(ageLine(b))}</p>
   <p class="small">${e([b.roastLevel,b.origin,b.method!=='Unknown'?b.method:'',b.portions.length?`${b.portions.length} storage portion${b.portions.length===1?'':'s'}`:''].filter(Boolean).join(' · '))}</p>`)).join('')||panel(`<p>${showArchived?'No archived bags.':'Add your first bag to track its roast age and see how your shots change.'}</p>`)}</div>
   ${details('Resting and storage',`<p>Let taste and flow guide you. Roasted coffee releases gas over time, and the rate of change depends on the coffee, roast, and packaging. Keep the bag sealed between uses. Track frozen portions separately and keep the original roast date.</p>`)}`;
}
export function bagEdit(b={},inBrew=false,pendingPhoto=null) {
  const photo=pendingPhoto??b.photo;
  return heading(b.id?'Edit bean bag':'Add a bean bag')+panel(form('bag-edit',
   `<div class="stack"><div><h2>Bag label <small>(optional)</small></h2>
   <p class="small">Add a photo and read the text on this device. Review any suggestions before saving.</p>
   <img id="bag-photo" class="photo section-gap" alt="Bag label preview"${photo?` src="${e(photo)}"`:' hidden'}>
   <div class="actions">
    <label class="button photo-picker"><span id="take-photo">${photo?'Retake photo':'Take photo'}</span><input type="file" id="take-photo-input" name="takePhoto" accept="image/*" capture="environment" aria-labelledby="take-photo" data-photo-picker></label>
    <label class="button photo-picker"><span id="choose-photo">${photo?'Replace photo':'Choose photo'}</span><input type="file" id="choose-photo-input" name="choosePhoto" accept="image/*" aria-labelledby="choose-photo" data-photo-picker></label>
    <button type="button" class="primary" data-action="read-label" id="read-label"${photo?'':' hidden'}>Read label</button>
    <button type="button" class="ghost" data-action="remove-photo" id="remove-photo"${photo?'':' hidden'}>Remove photo</button>
   </div>
   <p class="small" id="photo-status" role="status"></p>
   ${details('Photo picker didn’t open?',`<p class="small">If you opened Morning Pull inside another app, use its browser menu to open this page in Chrome or Edge. You can also copy the link below into your browser. Take a photo with Android’s Camera app first if needed, then use Choose photo.</p><p><a href="./#bag-new" target="_blank" rel="noopener">Open Morning Pull’s bag page</a></p>`)}
   <div id="label-status" class="small" role="status"></div><div id="label-text"></div></div>
   <div>${fields(input('Coffee name','name',b.name,'required maxlength="120"')+input('Roaster','roaster',b.roaster,'maxlength="120"')+
     select('Roast level','roastLevel',b.roastLevel??'',['','Light','Medium-light','Medium','Medium-dark','Dark'])+
     input('Roast date (optional)','roast',b.roast,'type="date"')+input('Date opened','opened',b.opened,'type="date"')+
     select('Storage method','method',b.method??'Unknown',methods))}
   ${details('More label details',fields(input('Origin','origin',b.origin,'maxlength="120"')+
     input('Processing method','process',b.process,'maxlength="120"')+input('Tasting notes','notes',b.notes,'maxlength="250"')),Boolean(b.origin||b.process||b.notes))}
   <p class="small">Leave the roast date blank if the label lists only a best-before date.</p></div></div>`+
    actions(submit(inBrew?'Save and continue':'Save bean bag')+link('Cancel',inBrew?'brew':b.id?'bag/'+b.id:'beans','ghost'))));
}
export function bagView(b,state) {
  const shots=state.shots.filter(s=>s.bagId===b.id);
  return `<div class="panel-header">${heading(bagName(b),ageLine(b))}${link('Edit bag','bag-edit/'+b.id)}</div><div class="grid section-gap">
   ${panel(`<h2>Bag details</h2>${b.photo?`<img class="photo" alt="Saved coffee bag label" src="${e(b.photo)}">`:''}
    <ul class="inline-list">${[b.roastLevel,b.roast?`Roasted ${b.roast}`:'',b.opened?`Opened ${b.opened}`:'',b.origin,b.process,b.notes,b.method!=='Unknown'?`Storage: ${b.method}`:''].filter(Boolean).map(t=>`<li>${e(t)}</li>`).join('')||'<li>No label details entered.</li>'}</ul>
    ${actions(btn(b.archived?'Restore bag':'Archive bag','archive-bag',b.id,'ghost')+btn('Delete bag','delete-bag',b.id,'ghost danger'))}`)}
   ${panel(`<div class="panel-header"><h2>Storage portions</h2>${link('Add portion','portion/'+b.id)}</div>
     <ul class="list">${b.portions.map(p=>`<li><strong>${e(p.name)}</strong> · ${e(p.method)}<p class="small">${p.frozen?`Frozen ${e(p.frozen)}`:'Freeze date unrecorded'}${p.thawed?` · Thawed ${e(p.thawed)}`:''}</p>
       ${p.events?.length?details('Earlier freeze and thaw dates',`<ul class="inline-list">${p.events.map(event=>`<li>Frozen ${e(event.frozen)}${event.thawed?` · Thawed ${e(event.thawed)}`:''}</li>`).join('')}</ul>`):''}
       ${actions(link('Edit','portion/'+b.id+'/'+p.id,'ghost')+btn('Freeze again','refreeze',b.id+'/'+p.id,'ghost'))}</li>`).join('')||'<li class="small">Add a portion to record freezing and thawing for part or all of the bag.</li>'}</ul>`)}
   ${panel(`<h2>Shots from this bag</h2><ul class="list">${shots.map(s=>`<li><a href="#shot/${e(s.id)}">${e(s.day)}</a> · ${e(s.tastes.join(', ')||'Taste unrecorded')}${s.change?` · ${e(s.change)}`:''}</li>`).join('')||'<li>No shots saved for this bag.</li>'}</ul>`)}</div>`;
}
export function portionEdit(b,p,refreeze=false) {
  return heading(refreeze?'Record another freeze':p?'Edit storage portion':'Add storage portion',bagName(b))+
   panel(form('portion',fields(input('Portion name','name',p?.name,'required maxlength="100"')+
    select('Storage method','method',p?.method??'Freezer',methods)+input('Date frozen','frozen',refreeze?'':p?.frozen,'type="date"')+
    input('Date thawed','thawed',refreeze?'':p?.thawed,'type="date"'))+
    actions(submit('Save portion')+link('Cancel','bag/'+b.id,'ghost'))));
}
const shotTitle = s => `${s.day} · ${s.bag.name || 'Untracked beans'}`;
const summary = s => [measure(s.actual.dose,'g'),measure(s.actual.yieldG,'g'),measure(s.actual.seconds,'s')].join(' / ');
export function historyView(state,selection,favorites) {
  const shots=state.shots.filter(s=>!favorites||s.favorite);
  return `<div class="panel-header">${heading('Shot history')}${link('Pull a shot','brew','primary')}</div>
   ${actions(link(favorites?'All shots':'Favorites',favorites?'history':'favorites','ghost')+btn('Compare selected','compare'))}
   <div class="stack section-gap">${shots.map(s=>panel(`<div class="row"><div><h2><a href="#shot/${e(s.id)}">${e(shotTitle(s))}${s.favorite?' ★':''}</a></h2>
   <p class="small">${e(summary(s))} · ${e(s.tastes.join(', ')||'Taste unrecorded')}</p></div><label class="label"><span>Compare</span>
   <input type="checkbox" data-refresh="compare" value="${e(s.id)}"${selection.has(s.id)?' checked':''} aria-label="Select ${e(shotTitle(s))} for comparison"></label></div>`)).join('')||panel('<p>No shots here yet.</p>')}</div>`;
}
export function shotBody(s) {
  return `<h2>Actual results</h2>${resultDisplay(s.actual)}
   ${s.actual.seconds!=null?`<p class="small section-gap">${e(TIMING[s.actual.timing])}</p>`:''}
   <p><strong>Taste</strong> · ${e(s.tastes.join(', ')||'Unrecorded')}${s.rating?` · ${s.rating}/5`:''}<br>
   <strong>Flow</strong> · ${e(s.flows.join(', ')||'Unrecorded')}</p>
   ${s.change?`<p><strong>Changed</strong> · ${e(s.change)}</p>`:''}
   ${s.note?`<p>${e(s.note)}</p>`:''}`;
}
export function shotView(s,state) {
  const related=state.shots.filter(other=>other.parentId===s.id);
  const original=state.shots.find(other=>other.id===s.parentId);
  return heading(shotTitle(s))+
   actions(btn('Repeat this recipe','repeat',s.id,'primary')+btn(s.favorite?'Remove favorite':'Favorite','favorite-shot',s.id)+link('Edit','shot-edit/'+s.id,'ghost')+btn('Delete','delete-shot',s.id,'ghost danger'))+
   `<div class="grid section-gap">${panel(shotBody(s))}${panel(advicePanel(s.advice))}${panel(`<h2>Planned targets</h2>${planDisplay(s.planned,s.gear)}
   ${details('Equipment and bean context',`<p class="small">${e([s.gear.machine,s.gear.grinder,s.gear.basket].filter(Boolean).join(' · '))}</p><p class="small">${e(ageLine(s.bag,s.day))}</p>
   <p class="small">${e([s.bag.portionName,s.bag.portionMethod||s.bag.method,s.bag.frozen?'Frozen '+s.bag.frozen:'',s.bag.thawed?'Thawed '+s.bag.thawed:''].filter(Boolean).join(' · '))}</p>`)}
   ${s.bagId?link('Open bean bag','bag/'+s.bagId,'ghost'):''}`)}
   ${panel(`<h2>Linked attempts</h2>${original?link('Previous attempt','shot/'+original.id,'ghost'):''}
   ${related.map(other=>`<p><a href="#shot/${e(other.id)}">${e(other.day)}</a> · ${e(other.change||'Change unrecorded')} · ${e(other.tastes.join(', ')||'Taste unrecorded')}</p>`).join('')||'<p class="small">Repeat this recipe or pull another shot from the guided flow to link your next attempt.</p>'}`)}</div>`;
}
export const shotEdit = s => heading('Edit shot',shotTitle(s))+panel(form('shot-edit',measurementFields(s.actual,s.planned.timing)+tasteFields(s)+
 input('What changed this time?','change',s.change,'maxlength="350"')+actions(submit('Save changes')+link('Cancel','shot/'+s.id,'ghost'))));
export function compareView(shots) {
  const mixed=new Set(shots.map(s=>s.actual.timing)).size>1 || shots.some(s=>s.actual.timing==='unknown');
  return heading('Compare shots')+(mixed?'<p class="note">Timing conventions differ or are unknown. Compare the times only when both shots were timed the same way.</p>':'')+
   `<div class="compare">${shots.map(s=>panel(`<p><a href="#shot/${e(s.id)}">${e(shotTitle(s))}</a></p>${shotBody(s)}<p class="small">Next step: ${e(s.advice.title)}</p>`)).join('')}</div>`+actions(link('Back to history','history','ghost'));
}
export function quickBrew(pouring,animate=false) {
  if(pouring) return pourView(pouring,animate);
  return panel(heading('Quick brew')+actions(btn('Start brewing','start-quick','','primary')));
}
export function calculator() {
  return heading('Brew calculator','Work in grams for the espresso calculations.')+`<div class="grid">
   ${panel(`<h2>Ratio, yield, and extraction</h2>${form('calculator',fields(
    number('Dry dose (g)','dose','','min=".001" max="60"')+number('Actual yield (g)','yieldG','','min=".001" max="500"')+
    number('Target ratio (1 to …)','ratio',2,'min=".001" max="10"')+number('Measured TDS (%)','tds','','min=".001" max="100"'))+
    '<p class="small">TDS means total dissolved solids. Enter a percentage from a coffee refractometer.</p>'+
    '<div id="calculated" aria-live="polite"></div>')}`)}
   ${panel(`<h2>How it works</h2><ul class="inline-list"><li>Brew ratio is 1 part dry coffee to beverage mass ÷ dry dose.</li>
   <li>Target beverage mass equals dose × the ratio multiplier.</li><li>Extraction yield (%) equals measured TDS (%) × beverage mass ÷ dry dose.</li></ul>
   <p class="small">Time helps compare similar shots. Extraction yield requires measured TDS.</p>`)}</div>`;
}
const recipeCard = r => panel(`<h2><a href="#recipe/${e(r.id)}">${e(r.name)}</a>${r.favorite?' ★':''}</h2>
  <p class="small">${e(r.description||r.items.map(i=>i.name).join(' · '))}</p>
  ${pantrySummary(r)}`);
const pantrySummary = r => (r.missing?.length?`<p class="small">Missing: ${e(r.missing.join(', '))}</p>`:'')+
  (r.unchecked?.length?`<p class="small">Check your pantry for: ${e(r.unchecked.join(', '))}</p>`:'')+
  (r.imported&&r.missing&&r.unchecked&&!r.missing.length&&!r.unchecked.length?'<p class="small">You have the ingredients</p>':'');
const recipeGrid = list => `<div class="grid">${list.map(recipeCard).join('')}</div>`;
export function drinkSuggestions(options) {
  const ideas=drinks(options);
  const ready=ideas.filter(r=>!r.missing.length);
  const extras=ideas.filter(r=>r.missing.length);
  return `<section class="section-gap"><h2>Make now</h2>
  ${ready.length?recipeGrid(ready):'<p class="small">Check what you have on hand to find a drink you can make now.</p>'}</section>
  ${extras.length?`<section class="section-gap"><h2>Needs extra ingredients</h2>${recipeGrid(extras)}</section>`:''}`;
}
export function savedDrinkCards(recipes,options) {
  const custom=recipes.filter(r=>r.kind==='drink').map(r=>matchImportedRecipe(r,options)).filter(r=>matchesDrinkPreference(r,options));
  return custom.length?`<section class="section-gap"><h2>Your saved drinks</h2>${recipeGrid(custom)}</section>`:'';
}
export function recipeHome(state,kind,options) {
  const custom=state.recipes.filter(r=>kind==='favorites'?r.favorite:r.kind===(kind==='drinks'?'drink':'syrup')).map(r=>matchImportedRecipe(r,options));
  const filters=kind==='drinks'?panel(form('drink-filter',`<h2>What are you in the mood for?</h2>`+fields(
    select('Temperature','temp',options.temp,['Hot','Iced'])+select('Milk preference','milk',options.milk,MILK_PREFERENCES)+
    select('Sweetness','sweet',options.sweet,['Unsweetened','Light','Regular','Sweet'])+select('Coffee strength','strength',options.strength,['Gentle','Regular','Bold']))+
    (options.diet==='Dairy-free'?'<p class="small">Your saved dairy-free preference still applies to ingredients, including sauces and toppings.</p>':'')+
    details('Ingredients & syrups on hand',checks('Ingredients','pantry',Object.entries(PANTRY),options.pantry)+
      checks('Syrup flavors','pantry',Object.entries(FLAVORS),options.pantry)+
      input('Another syrup you have','otherSyrup',options.otherSyrup,'maxlength="50" placeholder="e.g. Hazelnut"'),true)+
    '<p class="small">Strength changes the amount of espresso. Sweetness changes how much syrup to use.</p>'),'section-gap'):'';
  return `<div class="panel-header">${heading('Café recipes')}${actions(link('Import recipe','recipe-import')+link('Create recipe','recipe-new/'+(kind==='drinks'?'drink':'syrup')))}</div>
   ${actions(link('Syrups','recipes',kind==='syrups'?'primary':'ghost')+link('Drink ideas','drinks',kind==='drinks'?'primary':'ghost')+link('Favorites','recipe-favorites',kind==='favorites'?'primary':'ghost'))}
   ${kind==='drinks'?`${filters}<div id="drink-suggestions">${drinkSuggestions(options)}</div><p id="drink-update" class="sr-only" role="status"></p>
     <div id="saved-drinks">${savedDrinkCards(state.recipes,options)}</div>`:
     `<div class="section-gap">${kind==='syrups'?recipeGrid([...SYRUPS,...custom]):custom.length?recipeGrid(custom):panel('<p>No favorite recipes yet.</p>')}</div>`}`;
}
const recipeAmount = new Intl.NumberFormat(undefined,{maximumFractionDigits:7,useGrouping:false});
export const recipeItems = items => `<ul class="inline-list">${items.map(i=>`<li>
  ${i.amount==null?'':e(recipeAmount.format(i.amount)+(i.unit==='count'?'':' '+i.unit))+' '}
  <span>${e(i.name)}${i.optional?' (optional)':''}</span>${i.amount==null?' <small>(amount unconfirmed)</small>':''}</li>`).join('')}</ul>`;
const cupRecipePath = (where,recipe) => 'brew-drink/'+where+'/'+encodeURIComponent(recipe.id);
const cupFavorite = recipe => btn((recipe.favorite?'Unfavorite ':'Favorite ')+recipe.name,'favorite-recipe',recipe.id,'ghost');
export function brewedDrinkPicker({favorites,suggestions},where){
  const grid=recipes=>`<div class="grid">${recipes.map(recipe=>panel(
    `<h3><a href="#${e(cupRecipePath(where,recipe))}">${e(recipe.name)}</a></h3>${pantrySummary(recipe)}${actions(cupFavorite(recipe))}`)).join('')}</div>`;
  return heading('Make a drink','Use the espresso already in your cup.')+actions(link('Back to Brewing',where,'ghost'))+
    (favorites.length?`<section class="section-gap"><h2>Favorite drinks</h2>${grid(favorites)}</section>`:'')+
    (suggestions.length?`<section class="section-gap"><h2>${favorites.length?'More drinks you can make':'Drinks you can make'}</h2>${grid(suggestions)}</section>`:'')+
    (!favorites.length&&!suggestions.length?panel('<p>No drinks match your preferences and ingredients.</p>'+link('Edit drink preferences','drinks','ghost'),'section-gap'):'');
}
export function brewedDrinkRecipe(recipe,where){
  const additions=drinkAdditions(recipe);
  return heading(recipe.name)+actions(link('Back to drinks','brew-drinks/'+where,'ghost')+link('Back to Brewing',where,'ghost'))+
    panel('<h2>Add to your espresso</h2>'+
      (additions.length?recipeItems(additions):'<p>Your espresso is ready as it is.</p>')+
      (recipe.cupSteps?.length?`<ol class="inline-list">${recipe.cupSteps.map(step=>`<li>${e(step)}</li>`).join('')}</ol>`:'')+
      pantrySummary(recipe)+actions(cupFavorite(recipe)),'section-gap');
}
export function recipeView(r,isSaved) {
  const scalable=r.items.some(i=>i.amount!=null);
  const unmeasured=r.items.some(i=>i.amount==null);
  return heading(r.name,r.description)+`<div class="grid">${panel(`<h2>Ingredients</h2>
   ${r.yieldText?`<p class="small">Original yield: ${e(r.yieldText)}</p>`:''}
   ${unmeasured?'<p class="small">Amounts marked unconfirmed stay as written when scaling.</p>':''}
   ${scalable?form('recipe-scale',number('Batch multiplier','multiplier',1,'min=".01" max="100"')+`<div id="recipe-items" aria-live="polite">${recipeItems(r.items)}</div>`):recipeItems(r.items)}
   ${pantrySummary(r)}${r.swaps?.length?`<h3>Substitutions</h3><ul class="inline-list">${r.swaps.map(s=>`<li>${e(s)}</li>`).join('')}</ul>`:''}
   ${actions(btn(r.favorite?'Remove favorite':'Save as favorite','favorite-recipe',r.id,'primary')+
      link(isSaved?'Edit recipe':'Customize recipe','recipe-edit/'+r.id)+ (isSaved?btn('Delete','delete-recipe',r.id,'ghost danger'):''))}`)}
   ${panel(`<h2>Preparation</h2><ol class="inline-list">${r.steps.map(s=>`<li>${e(s)}</li>`).join('')}</ol>
   ${r.originalURL?`<p class="small"><a href="${e(r.originalURL)}" target="_blank" rel="noopener noreferrer">Original recipe</a></p>`:''}
   ${r.kind==='syrup'?details('Storage guidance',`<p>${STORAGE_GUIDANCE}</p>`):''}`)}
   </div>`;
}
export const ingredientRow = (i={},imported=false) => `<div class="ingredient-row">
   ${input('Ingredient','ingredient',i.name,'maxlength="250" required')}${number('Amount','amount',i.amount,'min=".0001" max="100000"'+(imported?'':' required'))}
   ${select('Unit','unit',i.unit??(imported?'':'g'),[['','Choose unit'],...recipeUnits])}${btn('Remove','remove-ingredient','','ghost')}
   <label><input type="checkbox" name="ingredient-optional"${i.optional?' checked':''}> Optional</label>
   ${imported&&i.name&&i.amount==null?'<p class="small ingredient-review">Check the quantity. You can leave the amount blank to keep this line as written.</p>':''}</div>`;
export function recipeEdit(r,review=false) {
  return heading(review?'Review imported recipe':r.name?'Customize recipe':'Create recipe')+panel(form('recipe-edit',`<div class="stack">
   ${fields(input('Recipe name','name',r.name,'required maxlength="130"')+
     select('Category','kind',r.kind,[['drink','Drink'],['syrup','Syrup']]))}
   ${input('Flavor description','description',r.description,'maxlength="150"')}
   ${input('Servings or batch yield','yieldText',r.yieldText,'maxlength="150"')}
   <div id="ingredient-rows" class="stack">${(r.items?.length?r.items:[{}]).map(i=>ingredientRow(i,r.imported)).join('')}</div>
   ${btn('Add ingredient','add-ingredient','','ghost')}
   ${textarea('Preparation steps (one per line)','steps',r.steps?.join('\n'))}
   ${textarea('Substitutions (one per line)','swaps',r.swaps?.join('\n'))}
   ${r.imported?input('Original recipe link (optional)','originalURL',r.originalURL,'type="url" maxlength="2048"'):''}
   </div>${actions(submit(review?'Confirm and save recipe':'Save recipe')+
     (review?btn('Back to import','recipe-import-back','','ghost'):link('Cancel',r.id?'recipe/'+r.id:r.kind==='drink'?'drinks':'recipes','ghost')))}`));
}
export function recipeImport(choices=[],source='') {
  if(choices.length) return heading('Choose a recipe')+panel(`<div class="stack">${choices.map((r,i)=>
    btn(r.name||'Untitled recipe '+(i+1),'recipe-import-choose',i)).join('')}${btn('Back to import','recipe-import-back','','ghost')}</div>`);
  return heading('Import recipe')+`<div class="grid">
    ${panel(form('recipe-link',`<h2>Paste a recipe link</h2><p class="small">Use a public HTTPS page that allows browser access.</p>
    ${input('Recipe link','url',source,'type="url" required maxlength="2048"')}${actions(submit('Read recipe link'))}`))}
    ${panel(form('recipe-text',`<h2>Paste recipe text</h2><p class="small">Include the recipe name, ingredients, and directions. Pasting works offline.</p>
    <label class="label">Recipe text<textarea name="recipeText" required maxlength="18000"></textarea></label>${actions(submit('Review recipe text'))}`))}
  </div>${actions(link('Back to café recipes','recipes','ghost'))}`;
}
export function settingsView(state,{offlineStatus,storageReady,editingEquipment}) {
  return heading('Settings & backups')+`<div class="grid">${panel(`<h2>Equipment defaults</h2>
   ${editingEquipment||!hasEquipment(state.equipment)?form('gear',gearForm(state.equipment)+actions(submit('Save equipment')+(hasEquipment(state.equipment)?btn('Cancel','equipment-cancel','','ghost'):''))):equipmentSummary(state.equipment)}`)}
   ${panel(`<h2>Local journal</h2><p>${storageReady?'Your equipment, bags, shots, and recipes save in this browser. Clearing site data can erase them. Use backups to move your journal to another device.':'This browser window is blocking local storage. You can still browse recipes, but changes cannot be saved here.'}</p>
   ${actions(btn('Export backup','export','','primary'))}<div class="section-gap">${form('import',input('Restore a backup','backup','','type="file" accept=".json,application/json" required')+
   '<p class="small">Restoring replaces the saved journal on this device. It also clears any unfinished walkthrough.</p>'+actions(submit('Review restore')))}</div>`)}
   ${panel(`<h2>Install & offline</h2><p id="offline-status" role="status">${offlineMessages[offlineStatus]}</p>
   <p class="small">If your browser offers installation, look for Install or Add to Home Screen in its menu.</p>
   <button type="button" data-action="offline-retry" class="ghost"${['pending','ready'].includes(offlineStatus)?' hidden':''}>Retry offline setup</button>
   <p class="small">Use your machine controls to start and stop brewing.</p>`)}
   ${panel(`<h2>How the coach works</h2><p>The app uses deterministic calculations and practical starting ratios. Taste, equipment, and flow guide the next change. Age and storage are context for comparing attempts.</p>
   <p class="small">Guided coaching runs on this device.</p>`)}
   </div><p class="small section-gap">Version ${APP_VERSION}</p>`;
}
