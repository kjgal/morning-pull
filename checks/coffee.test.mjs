import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {ratioOf,targetYield,extraction,scaleItems,age,storageDateError,bagDateError,startingRecipe,prepSteps,labelSuggestions,emptyState} from '../dist/core.js';
import {SYRUPS,drinks,brewedDrinkChoices,drinkAdditions} from '../dist/recipes.js';
import {importData} from '../dist/storage.js';

test('espresso uses mass ratios, and extraction needs measured TDS',()=>{
  assert.equal(ratioOf(18,36),2);
  assert.equal(targetYield(18,2.25),40.5);
  assert.equal(extraction(18,36,9),18);
  assert.equal(extraction(18,36,null),null);
  assert.equal(extraction(18,36,101),null);
  assert.equal(ratioOf(0,36),null);
  assert.equal(ratioOf('18',36),null);
});
test('syrup ingredients scale without converting units',()=>{
  const items=scaleItems(SYRUPS[1].items,2.5);
  assert.deepEqual(items.map(({amount,unit})=>[amount,unit]),[[250,'g'],[250,'g'],[12.5,'mL']]);
  assert.deepEqual(scaleItems(items,-1),[]);
});
test('dates are chronological and freeze dates do not reset roast age',()=>{
  const bag={roast:'2024-02-28',opened:'2024-03-01'};
  assert.equal(age(bag.roast,'2024-03-10'),11);
  assert.equal(age(bag.opened,'2024-03-10'),9);
  assert.equal(age('2024-02-30','2024-03-10'),null);
  assert.equal(age('','2024-03-10'),null);
  assert.equal(storageDateError({frozen:'2024-03-01',thawed:'2024-03-04'},bag,'2024-03-10'),'');
  assert.ok(storageDateError({frozen:'2024-03-04',thawed:'2024-03-01'},bag,'2024-03-10'));
  assert.ok(bagDateError({roast:'2024-03-04',opened:'2024-03-01'},'2024-03-10'));
});
test('starting recipes fit the basket and preparation fits the setup',()=>{
  assert.equal(startingRecipe({ratedDose:18},{roastLevel:'Light'},'Balanced').dose,18);
  const gear={ratedDose:18,machine:'Pump espresso machine',basket:'Single-wall / unpressurized',grinder:'Adjustable espresso grinder'};
  const bag={id:'light',roastLevel:'Light'};
  assert.equal(startingRecipe(gear,bag,'Balanced').ratio,2);
  assert.equal(startingRecipe(gear,bag,'Balanced').basis,'baseline');
  assert.equal(startingRecipe(gear,bag,'More clarity').ratio,2.25);
  assert.equal(startingRecipe(gear,bag,'More clarity').basis,'clarity');
  const liked={bagId:bag.id,portionId:'frozen',gear,tastes:['Balanced'],actual:{dose:18,yieldG:30}};
  const reuse=startingRecipe(gear,bag,'Balanced',[liked],'frozen');
  assert.equal(reuse.basis,'saved');
  assert.equal(targetYield(reuse.dose,reuse.ratio),30);
  assert.equal(startingRecipe(gear,bag,'Balanced',[liked]).ratio,2);
  assert.equal(startingRecipe({...gear,ratedDose:20},bag,'Balanced',[liked],'frozen').ratio,2);
  assert.equal(startingRecipe({ratedDose:18,machine:'Capsule machine'},null,'Balanced').dose,null);
  assert.match(prepSteps({machine:'Capsule machine'}).join(' '),/compatible capsule/);
  assert.doesNotMatch(prepSteps({scale:'No',tamper:'No or automatic'}).join(' '),/Weigh|tamp level/);
});
test('label fields are explicit and best-before is never a roast date',()=>{
  assert.deepEqual(labelSuggestions('BEST BEFORE: 2026-01-01'),{});
  assert.deepEqual(labelSuggestions('ROASTER: Alder Branch\nROAST DATE: 2025-10-20\nBEST BEFORE: 2026-01-01'),{roaster:'Alder Branch',roast:'2025-10-20'});
  assert.deepEqual(labelSuggestions('ROAST DATE: 2025-10-20\nROASTED ON: 2025-10-21'),{});
});
test('dairy-free drinks substitute plant milk and list missing ingredients',()=>{
  const filtered=drinks({temp:'Iced',milk:'Whole dairy milk',diet:'Dairy-free',sweet:'Unsweetened',strength:'Bold',pantry:['espresso','water','ice']});
  assert.equal(filtered[0].name,'Iced Americano');
  assert.equal(filtered[0].items[0].amount,50);
  const latte=filtered.find(d=>d.id==='latte');
  assert.ok(latte.missing.includes('Oat milk'));
  assert.ok(latte.swaps.some(s=>s.includes('plant milk')));
  assert.ok(latte.items.every(i=>i.key!=='syrup'));
});
test('drink suggestions update temperature and keep optional syrup out of missing ingredients',()=>{
  const options={milk:'Oat milk',sweet:'Light',strength:'Regular',pantry:['espresso','water','ice','milk','brownSyrup']};
  const iced=drinks({...options,temp:'Iced'});
  const hot=drinks({...options,temp:'Hot'});
  assert.ok(iced.some(r=>r.id==='tonic'));
  assert.ok(hot.every(r=>r.temp==='Hot'&&!r.name.startsWith('Iced ')));
  assert.deepEqual(hot.find(r=>r.id==='brown-sugar').missing,[]);
  assert.deepEqual(hot.find(r=>r.id==='americano').missing,[]);
  const noSyrup=drinks({...options,temp:'Hot',pantry:['water','espresso']}).find(r=>r.id==='americano');
  assert.ok(noSyrup.items.some(i=>i.optional&&i.key==='simpleSyrup'));
  assert.deepEqual(noSyrup.missing,[]);
  assert.ok(drinks({...options,otherSyrup:'Hazelnut'}).some(r=>r.id==='personal-syrup'&&r.missing.length===0));
});

test('backup validation rejects duplicates and damaged records',()=>{
  assert.deepEqual(importData(emptyState()),emptyState());
  assert.throws(()=>importData({...emptyState(),bags:[{id:'b'}]}));
  assert.throws(()=>importData({...emptyState(),version:99}));
});
test('service worker precaches core and serves the navigation fallback without internet',async()=>{
  const events={};
  const saved=new Map();
  const scope='https://espresso.example/';
  const source=await readFile(new URL('../dist/sw.js',import.meta.url),'utf8');
  const cache={
    addAll:paths=>{for(const path of paths) saved.set(new URL(path,scope).href,path);},
    match:request=>saved.get(typeof request==='string'?request:request.url)
  };
  let network=()=>Promise.reject(new Error('offline'));
  runInNewContext(source,{
    self:{registration:{scope},addEventListener:(name,handler)=>{events[name]=handler;},skipWaiting:()=>{}},
    caches:{open:async()=>cache},
    fetch:()=>network(),URL
  });
  let outcome;
  events.install({waitUntil:p=>{outcome=p;}});
  await outcome;
  assert.ok(saved.has(scope+'app.js'));
  assert.ok(saved.has(scope+'chat.js'));
  events.fetch({request:{method:'GET',mode:'navigate',url:scope},respondWith:p=>{outcome=p;}});
  assert.equal(await outcome,scope);
  assert.ok(!saved.has(scope+'index.html'));
  events.fetch({request:{method:'GET',mode:'cors',url:scope+'app.js'},respondWith:p=>{outcome=p;}});
  assert.equal(await outcome,scope+'app.js');
  const signedOut={status:401};
  network=async()=>signedOut;
  events.fetch({request:{method:'GET',mode:'navigate',url:scope},respondWith:p=>{outcome=p;}});
  assert.equal(await outcome,signedOut);
  network=async()=>({status:503});
  events.fetch({request:{method:'GET',mode:'navigate',url:scope},respondWith:p=>{outcome=p;}});
  assert.equal(await outcome,scope);
});

test('puck prep follows the selected machine routine, current dose, and tools',()=>{
  const gear={machine:'Pump espresso machine',scale:'Yes',distribution:'Needle distribution tool',tamper:'Yes'};
  assert.deepEqual(prepSteps(gear,{dose:20}),[
    ['warmup','Warm up the machine','Let your machine reach brewing temperature.'],
    ['dose','Weigh 20 g of coffee.'],
    ['wdt','Use your WDT needle tool to break up clumps.'],
    ['tamp','Tamp level.']
  ]);
  assert.equal(prepSteps({...gear,warmup:'Warming flush recommended'},{dose:19})[0][2],
    'Run a warming flush before adding coffee.');
  assert.equal(prepSteps(gear,{dose:19})[1][1],'Weigh 19 g of coffee.');
  assert.deepEqual(prepSteps({...gear,machine:'Automatic / bean-to-cup'}).map(([key])=>key),['warmup','load']);
  assert.equal(startingRecipe(gear,null,'Balanced').dose,18);
});

test('milk preferences filter no-milk ideas and use the selected milk in creamy drinks',()=>{
  const options={temp:'Iced',pantry:['water','ice','milk','espresso']};
  const noMilk=drinks({...options,milk:'No milk'});
  assert.ok(noMilk.some(r=>r.name==='Iced Americano'));
  assert.ok(noMilk.every(r=>r.items.every(i=>i.key!=='milk')));
  assert.ok(drinks({...options,milk:'No preference'}).some(r=>r.id==='latte'));
  assert.equal(drinks({...options,milk:'Oat milk'}).find(r=>r.id==='latte').items.find(i=>i.key==='milk').name,'Oat milk');
});

test('brewed drinks list compatible favorites first without requiring espresso in the pantry',()=>{
  const options={temp:'Iced',milk:'No milk',pantry:['water','ice']};
  const americano=drinks(options).find(r=>r.id==='americano');
  const saved={...americano,id:'saved-americano',favorite:true};
  const {favorites,suggestions}=brewedDrinkChoices([saved],options);
  assert.deepEqual(favorites.map(r=>r.id),['saved-americano']);
  assert.ok(!favorites[0].missing.length);
  assert.ok(!suggestions.some(r=>r.name==='Iced Americano'));
  assert.deepEqual(drinkAdditions(favorites[0]).filter(i=>!i.optional).map(i=>i.name),['Water','Ice']);
  assert.match(favorites[0].cupSteps[0],/Add the cold water and ice to your espresso/);
  const toggled=brewedDrinkChoices([{...saved,favorite:false}],options);
  assert.deepEqual(toggled.suggestions.filter(r=>r.name==='Iced Americano').map(r=>r.id),['saved-americano']);
});

test('legacy dairy-free preference also checks sauces, including optional toppings',()=>{
  const drink=(id,name)=>({id,kind:'drink',favorite:true,items:[
    {name:'Brewed espresso'},{name:'Oat milk'},{name,optional:true}
  ]});
  const old={milk:'No preference',diet:'Dairy-free',temp:'Iced',pantry:['milk','ice','water']};
  const saved=[drink('dairy','Whipped cream'),drink('unknown','Caramel sauce'),drink('plant','Dairy-free caramel sauce')];
  assert.deepEqual(brewedDrinkChoices(saved,old).favorites.map(r=>r.id),['plant']);
  assert.deepEqual(brewedDrinkChoices(saved,{...old,milk:'No milk'}).favorites,[]);
  const ideas=drinks({...old,otherSyrup:'Milk chocolate sauce'});
  assert.ok(ideas.every(r=>r.items.every(i=>i.name!=='Milk chocolate sauce')));
});
