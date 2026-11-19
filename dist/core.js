export const TIMING = {
  start: 'From brew start, including pre-infusion',
  drip: 'From first drip, excluding pre-infusion',
  unknown: 'Timing convention unknown'
};

export const EQUIPMENT = {
  machine: ['Not sure', 'Pump espresso machine', 'Manual lever', 'Automatic / bean-to-cup', 'Capsule machine'],
  grinder: ['Not sure', 'Adjustable espresso grinder', 'Fixed or limited grinder', 'Pre-ground coffee', 'Built-in or automated'],
  basket: ['Not sure', 'Single-wall / unpressurized', 'Dual-wall / pressurized', 'Built-in basket', 'Capsule'],
  scale: ['Not sure', 'Yes', 'No'],
  timer: ['Not sure', 'Use app timer', 'Machine or separate timer', 'No'],
  stop: ['Not sure', 'Can stop at a chosen yield', 'Preset or automatic only'],
  temperature: ['Not sure', 'Adjustable', 'Fixed'],
  infusion: ['Not sure', 'Adjustable', 'Automatic or fixed', 'None'],
  tamper: ['Not sure', 'Yes', 'No or automatic'],
  distribution: ['Not sure', 'Needle distribution tool', 'Other tool', 'None']
};

export const emptyState = () => ({version:1,bags:[],shots:[],recipes:[],equipment:{},equipmentSetupSkipped:false,preferences:{sound:false,vibrate:false,wake:false},draft:null,updatedAt:null});
export const id = () => globalThis.crypto.randomUUID();
export const round = (n, digits = 2) => Number(n.toFixed(digits));
export const positive = (n, max = Infinity) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= max;
export const ratioOf = (dose,yieldG) => positive(dose) && positive(yieldG) ? yieldG / dose : null;
export const targetYield = (dose,ratio) => positive(dose) && positive(ratio) ? dose * ratio : null;
export const extraction = (dose,yieldG,tds) => positive(tds,100) && ratioOf(dose,yieldG) !== null ? tds * ratioOf(dose,yieldG) : null;
export const scaleItems = (items, multiplier) => positive(multiplier) ? items.map(item => item.amount==null?item:{...item, amount:item.amount * multiplier}) : [];

export function localDate(date = new Date()) {
  const fields = [date.getFullYear(),date.getMonth()+1,date.getDate()];
  return fields.map((v,i) => String(v).padStart(i ? 2 : 4,'0')).join('-');
}
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === value ? timestamp : null;
}
export function age(date,on = localDate()) {
  const start = dateValue(date);
  const end = dateValue(on);
  return start === null || end === null || end < start ? null : (end - start) / 86400000;
}
export function bagDateError(bag, today = localDate()) {
  if (bag.roast && age(bag.roast,today) === null) return 'Use a valid roast date on or before today.';
  if (bag.opened && age(bag.opened,today) === null) return 'Use a valid opening date on or before today.';
  if (bag.roast && bag.opened && age(bag.roast,bag.opened) === null) return 'Opening date must be on or after the roast date.';
  return '';
}
export function storageDateError(portion, bag, today = localDate()) {
  for (const date of [portion.frozen,portion.thawed]) {
    if (date && (age(date,today) === null || (bag.roast && age(bag.roast,date) === null))) return 'Use a storage date from roast day through today.';
  }
  if (portion.thawed && (!portion.frozen || age(portion.frozen,portion.thawed) === null)) return 'Record the freeze date before the thaw date.';
  return '';
}
export const isCapsule = gear => gear.machine === 'Capsule machine' || gear.basket === 'Capsule';
export const hasPuck = gear => !isCapsule(gear) && gear.machine !== 'Automatic / bean-to-cup' && gear.basket !== 'Built-in basket';

export function startingRecipe(gear,bag,goal,savedShots=[],portionId='') {
  const dose = !isCapsule(gear) && positive(gear.ratedDose,60) ? gear.ratedDose : null;
  const matching = dose!==null && bag?.id && goal==='Balanced' && savedShots.find(shot=>
    shot.bagId===bag.id && (shot.portionId??'')===portionId &&
    gear.machine && gear.machine!=='Not sure' && gear.basket && gear.basket!=='Not sure' &&
    ['machine','basket','grinder'].every(key=>gear[key]===shot.gear?.[key]) &&
    (shot.tastes?.includes('Balanced')||shot.favorite&&shot.rating>=4) &&
    shot.actual?.dose===dose && positive(shot.actual?.yieldG,500) && positive(shot.actual.yieldG/dose,10)
  );
  const basis = matching?'saved':goal==='More body'?'body':goal==='More clarity'?'clarity':'baseline';
  const ratio = matching?matching.actual.yieldG/dose:basis==='body'?1.75:basis==='clarity'?2.25:2;
  return {dose,ratio,basis,timing:'unknown',temperature:null,preInfusion:null};
}
export function recipeReason(plan) {
  return ({
    baseline:'A 1:2 starting point gives you a reference for dialing in this coffee.',
    body:'You chose more body, so this shorter ratio aims for a more concentrated cup.',
    clarity:'You chose more clarity, so this longer ratio aims for a less concentrated cup.',
    saved:'This target comes from a measured shot you liked with this coffee and setup.',
    repeat:'This target comes from the saved recipe you chose to repeat.',
    coach:'This target follows the dose and yield adjustment you accepted from troubleshooting.',
    custom:'This target comes from the recipe settings you entered.'
  })[plan.basis]??'This target was saved in your draft. You can replan it or edit the cup target.';
}
export function prepSteps(gear) {
  if (isCapsule(gear)) return ['Use a compatible capsule and follow your machine’s instructions.','Set a cup in place and choose a brew size your machine supports.'];
  if (!hasPuck(gear)) return ['Load the coffee as directed by your machine.','Choose an available shot size and place a cup under the outlet.'];
  return [
    'Start with a clean, dry basket. Use a dose that fits the basket’s rated range.',
    gear.scale === 'Yes' ? 'Weigh the dry grounds before brewing.' : 'Use the same dose routine each time. Leave measurements blank when you cannot measure them.',
    gear.distribution === 'Needle distribution tool' ? 'Use your needle tool to break up clumps and level the grounds.' : 'Spread the grounds evenly across the basket before tamping.',
    gear.tamper === 'No or automatic' ? 'Follow your machine or basket instructions for compacting the grounds.' : 'If your basket calls for a tamp, tamp level and keep your routine consistent.'
  ];
}
export const TASTES = ['Balanced','Sour','Bitter','Dry','Weak','Too intense','Other'];
export const FLOWS = ['Steady','Fast','Slow','Uneven','Spraying','Choked','Inconsistent','Not sure'];

export function labelSuggestions(text) {
  const lines = text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const proposal = {};
  const rules = {
    name:/^(?:coffee(?: name)?|name)\s*[:–-]\s*(.+)$/i,
    roaster:/^(?:roasted by|roaster)\s*[:–-]\s*(.+)$/i,
    origin:/^origin\s*[:–-]\s*(.+)$/i,
    process:/^process(?:ing)?\s*[:–-]\s*(.+)$/i,
    notes:/^(?:tasting notes|flavou?r notes)\s*[:–-]\s*(.+)$/i,
    roastLevel:/^(?:roast(?: level| profile)?)\s*[:–-]\s*(light|medium-light|medium|medium-dark|dark)(?:\s+roast)?$/i
  };
  for (const [key,rule] of Object.entries(rules)) {
    const hits = [...new Set(lines.map(line => line.match(rule)?.[1]).filter(Boolean))];
    if (hits.length === 1) proposal[key] = key === 'roastLevel' ? hits[0].replace(/^./,letter => letter.toUpperCase()) : hits[0];
  }
  const dates = [...new Set(lines.filter(line => !/best\s*(before|by)|expir|use\s*by|bb[de]/i.test(line))
    .map(line => line.match(/^(?:roasted on|roast date|roasted)\s*[:–-]?\s*(\d{4}-\d{2}-\d{2})$/i)?.[1])
    .filter(value => value && age(value) !== null))];
  if (dates.length === 1) proposal.roast = dates[0];
  return proposal;
}
