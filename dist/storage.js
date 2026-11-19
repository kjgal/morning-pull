import {emptyState,positive,bagDateError,storageDateError,TIMING,EQUIPMENT,dateValue,validTimerTarget,measuredShotTime} from './core.js';
import {recipeURL,recipeUnits} from './recipe-import.js';
const validOriginal = value => {
  if(value===undefined||value==='') return true;
  if(typeof value!=='string'||value.length>2048) return false;
  try { return recipeURL(value).href===value; } catch { return false; }
};
const DB = 'morning-pull';
const STORE = 'data';
const KEY = 'journal';
const text = v => typeof v === 'string';
const strings = v => Array.isArray(v) && v.every(text);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const nullable = (v,limit) => v === null || positive(v,limit);
const photo = v => v === '' || (text(v) && v.length < 2000000 && /^data:image\/jpeg;base64,[a-z\d+/]+=*$/i.test(v));
const validPortion = (p,b) => record(p) && ['id','name','method','frozen','thawed'].every(k=>text(p[k])) &&
  !storageDateError(p,b) && (!p.events || (Array.isArray(p.events) && p.events.every(e=>record(e) && text(e.frozen) && text(e.thawed) && !storageDateError(e,b))));
const validBag = b => record(b) && ['id','name','roaster','roastLevel','roast','opened','origin','process','notes','method','createdAt','updatedAt'].every(k=>text(b[k])) &&
  Boolean(b.id && b.name) && photo(b.photo) && typeof b.archived === 'boolean' && !bagDateError(b) && Array.isArray(b.portions) &&
  b.portions.every(p=>validPortion(p,b)) && new Set(b.portions.map(p=>p.id)).size===b.portions.length;
const validGear = gear => record(gear) && Object.entries(EQUIPMENT).every(([key,values])=>gear[key]===undefined || values.includes(gear[key])) &&
  (gear.ratedDose===undefined || nullable(gear.ratedDose,60));
const validPlan = p => record(p) && nullable(p.dose,60) && positive(p.ratio,10) && Object.hasOwn(TIMING,p.timing) &&
  (p.temperature===null || (Number.isFinite(p.temperature) && p.temperature>=70 && p.temperature<=105)) && nullable(p.preInfusion,90) && (p.targetSeconds==null||validTimerTarget(p.targetSeconds)) && ['grind','prep','heat'].every(k=>p[k]===undefined || (text(p[k]) && p[k].length<=250));
const validActual = a => record(a) && nullable(a.dose,60) && nullable(a.yieldG,500) && nullable(a.seconds,3600) &&
  nullable(a.tds,100) && Object.hasOwn(TIMING,a.timing) && (a.timeSource===undefined||measuredShotTime(a));
const validSnapshot = s => record(s) && ['name','roaster','roast','opened','method','portionName','portionMethod','frozen','thawed'].every(k=>text(s[k]));
const validShot = s => record(s) && ['id','createdAt','updatedAt','day','bagId','portionId','parentId','goal','note','change','detail'].every(k=>text(s[k])) &&
  dateValue(s.day)!==null && validSnapshot(s.bag) && validGear(s.gear) && validPlan(s.planned) && validActual(s.actual) &&
  strings(s.tastes) && strings(s.flows) && (s.rating===null || (Number.isInteger(s.rating) && positive(s.rating,5))) &&
  typeof s.favorite==='boolean' && record(s.advice) && ['title','change','keep','watch','why'].every(k=>text(s.advice[k]));
const validRecipe = r => record(r) && text(r.id) && text(r.name) && Boolean(r.name.trim()) && ['syrup','drink'].includes(r.kind) &&
  Array.isArray(r.items) && r.items.length>0 && r.items.every(i=>record(i) && text(i.name) && Boolean(i.name.trim()) && (i.amount===null?r.imported===true&&i.unit==='':positive(i.amount,100000)&&recipeUnits.includes(i.unit))) &&
  validOriginal(r.originalURL) && (r.yieldText===undefined||text(r.yieldText)) &&
  (r.cupSteps===undefined||strings(r.cupSteps)) && strings(r.steps) && r.steps.length>0 && typeof r.favorite==='boolean';
const unique = rows => new Set(rows.map(row=>row.id)).size===rows.length;

export function importData(value) {
  if (!record(value) || value.version!==1 || !['bags','shots','recipes'].every(key=>Array.isArray(value[key]))) throw new Error('Choose a Morning Pull backup in the current format.');
  if (!value.bags.every(validBag) || !unique(value.bags) || !value.shots.every(validShot) || !unique(value.shots) ||
      !value.recipes.every(validRecipe) || !unique(value.recipes) || !validGear(value.equipment)) throw new Error('This backup contains invalid or duplicate records. Your journal was left as it was.');
  const bagMap = new Map(value.bags.map(b=>[b.id,b]));
  const shotIds = new Set(value.shots.map(s=>s.id));
  if (value.shots.some(s=> (s.bagId && !bagMap.has(s.bagId)) || (s.portionId && !bagMap.get(s.bagId)?.portions.some(p=>p.id===s.portionId)) ||
    (s.parentId && (s.parentId===s.id || !shotIds.has(s.parentId))))) throw new Error('This backup has a shot linked to a missing bag, portion, or attempt.');
  return {...emptyState(),bags:value.bags,shots:value.shots,recipes:value.recipes,equipment:value.equipment,equipmentSetupSkipped:value.equipmentSetupSkipped===true,
    preferences:Object.fromEntries(['sound','vibrate','wake'].map(k=>[k,value.preferences?.[k]===true]))};
}

let database;
function db() {
  database ??= new Promise((resolve,reject)=>{
    const open = indexedDB.open(DB,1);
    open.onupgradeneeded=()=>open.result.createObjectStore(STORE);
    open.onsuccess=()=>resolve(open.result);
    open.onerror=()=>reject(open.error);
  });
  return database;
}
export async function load() {
  const connection = await db();
  return new Promise((resolve,reject)=>{
    const request=connection.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess=()=>resolve(request.result ?? emptyState());
    request.onerror=()=>reject(request.error);
  });
}
export async function persist(value,expectedRevision) {
  const connection = await db();
  return new Promise((resolve,reject)=>{
    const tx=connection.transaction(STORE,'readwrite');
    const store=tx.objectStore(STORE);
    const request=store.get(KEY);
    let conflict=false;
    request.onsuccess=()=>{
      if ((request.result?.updatedAt ?? null)!==expectedRevision) {
        conflict=true;
        tx.abort();
        return;
      }
      store.put(value,KEY);
    };
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(conflict ? new Error('This journal changed in another tab. Reload this tab to continue.') : tx.error ?? new Error('Browser storage could not save this change.'));
  });
}
