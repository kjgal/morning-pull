import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEspresso,coachGear,updateCoachAnswer} from '../dist/espresso-coach.js';
import {coachScreen,nextBaseline} from '../dist/coach-ui.js';
import {brewView} from '../dist/ui.js';
import {quickBrew,bagEdit,home} from '../dist/views.js';
import {targetYield} from '../dist/core.js';

const gear={machine:'Pump espresso machine',basket:'Single-wall / unpressurized',grinder:'Adjustable espresso grinder',
  scale:'Yes',stop:'Can stop at a chosen yield',temperature:'Adjustable',distribution:'Needle distribution tool'};
const planned={dose:18,ratio:2,timing:'start',temperature:93,preInfusion:null};
const actual={dose:18,yieldG:36,seconds:29,timing:'start'};
const shot=(taste,flow,overrides={})=>evaluateEspresso({gear,planned,actual,
  ...overrides,answers:{taste,flow,...overrides.answers}});

test('sharp and fast vs steady, mixed and uneven, and bitter slow lead to different actions',()=>{
  assert.match(shot('Sour','Fast').patch.grind,/finer/);
  assert.match(shot('Bitter','Slow').patch.grind,/coarser/);
  assert.match(shot('Mixed','Uneven').patch.prep,/needle/);
  const advice=shot('Sour','Steady');
  assert.equal(advice.kind,'change');
  assert.equal(advice.fact,'Measured ratio 1:2.');
  assert.match(advice.change,/38.7 g.*\+2.7 g/);
  assert.equal(Number(targetYield(advice.patch.dose,advice.patch.ratio).toFixed(1)),38.7);
  assert.match(shot('Weak','Steady').change,/33.3 g/);
});

test('unknown measurements are asked for once; demo targets never count as measurements',()=>{
  const unmeasured={dose:null,yieldG:null,seconds:29,timing:'start'};
  assert.equal(shot('Bitter','Steady',{actual:unmeasured}).key,'yield');
  assert.equal(shot('Bitter','Steady',{actual:{...unmeasured,yieldG:36}}).key,'dose');
  const outcome=shot('Bitter','Steady',{actual:unmeasured,answers:{noYield:true,warm:'unknown'}});
  assert.equal(outcome.kind,'diagnostic');
  assert.equal(outcome.patch,null);
  assert.equal(outcome.fact,'');
  assert.match(outcome.title,/Weigh/);
  assert.equal(shot('Sour','unknown').kind,'diagnostic');
  assert.equal(shot('Sour',undefined).key,'flow');
  assert.equal(shot(undefined,'Fast').key,'taste');
});

test('a measured adjustment that reaches the existing planned target does not change the plan',()=>{
  const advice=shot('Sour','Steady',{actual:{...actual,yieldG:33.3}});
  assert.equal(advice.patch,null);
  assert.match(advice.summary,/already 36 g/);
});

test('pressurized, fixed, capsule and unknown controls do not suggest unsupported changes',()=>{
  for (const limited of [{...gear,basket:'Dual-wall / pressurized'},{...gear,grinder:'Pre-ground coffee'},
    {machine:'Capsule machine',basket:'Capsule'},{}]){
    const fast=shot('Sour','Fast',{gear:limited,answers:{basketFit:'yes',grinder:limited.grinder??'unknown',doseFit:'yes'}});
    assert.ok(['diagnostic','question'].includes(fast.kind));
    assert.ok(!fast.patch);
    assert.doesNotMatch(fast.change??'',/grind a little|temperature increment|clean the basket/i);
  }
  const capsule=shot('Sour','Steady',{gear:{...gear,machine:'Capsule machine',basket:'Capsule'}});
  assert.equal(capsule.kind,'diagnostic');
  assert.equal(capsule.patch,null);
});

test('conflicting taste and flow require more evidence; a comparable timing conflict prompts a question',()=>{
  assert.equal(shot('Bitter','Fast').key,'even');
  assert.equal(shot('Bitter','Fast',{answers:{even:'unknown'}}).kind,'diagnostic');
  const previous={actual:{...actual,timeSource:'manual'},gear,planned};
  const early={...actual,timeSource:'manual',seconds:16};
  const late={...actual,timeSource:'manual',seconds:48};
  assert.equal(shot('Sour','Fast',{actual:{...actual,seconds:null},previous}).key,'time');
  assert.match(shot('Sour','Fast',{actual,previous,answers:{noTime:true}}).patch.grind,/finer/);
  assert.match(shot('Sour','Fast',{actual:late,previous:{...previous,actual}}).patch.grind,/finer/);
  assert.equal(shot('Sour','Fast',{actual:late,previous}).key,'interruption');
  assert.equal(shot('Bitter','Slow',{actual:early,previous,answers:{interruption:'yes'}}).kind,'diagnostic');
  assert.match(shot('Sour','Fast',{actual:{...late,timing:'drip'},previous}).patch.grind,/finer/);
  assert.match(shot('Sour','Fast',{actual:late,previous,answers:{interruption:'no'}}).patch.grind,/finer/);
});

test('temperature requires warm, repeatable shots with confirmed controls; storage elicits an aroma check',()=>{
  const context={gear:{...gear,stop:'Preset or automatic only'},bag:{roastLevel:'Light'},answers:{warm:'yes',repeat:'yes'}};
  assert.match(shot('Sour','Steady',context).patch.heat,/warmer/);
  assert.equal(shot('Sour','Steady',{...context,gear:{...context.gear,temperature:'Fixed'}}).patch,null);
  assert.match(shot('Sour','Steady',{...context,answers:{warm:'no'}}).patch.prep,/Warm up/);
  const beans={bag:{opened:'2026-11-01',method:'Freezer'},portion:{thawed:'2026-11-16'}};
  assert.equal(shot('Other','Steady',beans).key,'aroma');
  assert.equal(shot('Other','Steady',{...beans,answers:{aroma:'yes'}}).kind,'diagnostic');
});
test('result renders useful advice and optional save; diagnostics render without a recipe patch',()=>{
  const session={screen:'evaluate',actual,planned,gear,answers:{},undone:false};
  const result=coachScreen(session,{bags:[]},null,shot('Sour','Steady'),false);
  assert.match(result,/Try this next/);
  assert.match(result,/Undo/);
  assert.match(result,/Save this result/);
  assert.match(result,/Look for/);
  const diagnostic=coachScreen(session,{bags:[]},null,shot('Sour','unknown'),false);
  assert.match(diagnostic,/Diagnostic check/);
  assert.doesNotMatch(diagnostic,/Undo|Next proposed recipe|One change to try/);
  assert.equal(nextBaseline({...planned,grind:'Previously change grind'}).grind,undefined);
  assert.match(diagnostic,/Brew a test shot/);
  assert.doesNotMatch(diagnostic,/Report what happened/);
  assert.doesNotMatch(diagnostic,/Brew with the same recipe/);
});

test('guided, saved legacy drafts, and quick entry points use the same pouring view',()=>{
  const state={bags:[],shots:[],preferences:{}};
  const draft={gear,planned,actual,timer:{startedAt:null}};
  for(const step of [3,4,5]){
    const markup=brewView({...draft,step},state);
    assert.match(markup,/Suggested recipe[\s\S]*Start brewing/);
    assert.doesNotMatch(markup,/Open shot timer|Start timer|Time your shot|Record results/);
  }
  for(const markup of [brewView({...draft,step:5,timer:{startedAt:100}},state),brewView({...draft,step:5,pouring:true},state),quickBrew(true)]){
    assert.match(markup,/pour-scene[\s\S]*Ready to taste/);
    assert.doesNotMatch(markup,/Shot time|Elapsed time|cue-status|Record results/);
  }
  assert.match(quickBrew(false),/Start brewing/);
});
test('the result explains channeling inline and has one secondary edit action',()=>{
  const markup=coachScreen({screen:'evaluate',actual,planned,gear},{bags:[]},null,shot('Mixed','Uneven'),false);
  assert.match(markup,/Why it helps[\s\S]*channeling/);
  assert.match(markup,/Edit answers/);
  assert.doesNotMatch(markup,/<details>|Sources|https:/);
});
test('fast flow asks relevant equipment questions and uses the answer immediately',()=>{
  const base={machine:'Pump espresso machine'};
  assert.equal(shot(undefined,'Fast',{gear:base}).key,'grinder');
  const adjustable='Adjustable espresso grinder';
  assert.equal(shot('Sour','Fast',{gear:base,answers:{grinder:adjustable}}).key,'basket');
  const basket='Single-wall / unpressurized';
  const resolved=shot('Sour','Fast',{gear:base,answers:{grinder:adjustable,basket}});
  assert.match(resolved.patch.grind,/finer/);
  const unknown=shot('Sour','Fast',{gear:base,answers:{grinder:'unknown',basket:'unknown'}});
  assert.equal(unknown.kind,'diagnostic');
  assert.equal(unknown.report,'even');
  assert.equal(unknown.patch,null);
  const limited={...base,basket,grinder:'Pre-ground coffee'};
  assert.equal(shot('Sour','Fast',{gear:limited}).key,'doseFit');
  assert.equal(shot('Sour','Fast',{gear:limited,answers:{doseFit:'no'}}).title,'Use the basket’s rated dose');
  assert.equal(coachGear(base,{grinder:adjustable}).grinder,adjustable);
  assert.equal(coachGear(base,{grinder:'unknown'}).grinder,'Not sure');
});
test('home has a dedicated responsive image using the original cafe artwork',()=>{
  assert.match(home({}),/class="hero-art"[\s\S]*<img src=".\/cafe.webp" width="1440" height="576"[\s\S]*class="hero-content"/);
});
test('bag photo actions point to distinct themed camera and gallery controls',()=>{
  const markup=bagEdit();
  assert.match(markup,/<input type="file" id="take-photo-input" name="takePhoto" accept="image\/\*" capture="environment"/);
  assert.match(markup,/<input type="file" id="choose-photo-input" name="choosePhoto" accept="image\/\*" aria-labelledby="choose-photo" data-photo-picker/);
  assert.match(markup,/Take photo/);
  assert.match(markup,/Choose photo/);
  assert.match(bagEdit({photo:'data:image/jpeg;base64,abcd'}),/Retake photo[\s\S]*Replace photo[\s\S]*Read label/);
});

test('the old cleaning loop is gated by obstruction evidence and clean advances the diagnosis',()=>{
  const pressurized={...gear,basket:'Dual-wall / pressurized',grinder:'Pre-ground coffee'};
  const args={gear:pressurized,actual:{},answers:{basketFit:'yes',basketCondition:'blocked'}};
  const blocked=shot('Bitter','Slow',args);
  assert.equal(blocked.checkClean,true);
  assert.match(blocked.change,/clean it using your machine’s instructions/);
  const markup=coachScreen({screen:'evaluate',actual:{},planned,gear:pressurized,answers:args.answers},{bags:[]},null,blocked,false);
  assert.match(markup,/Already checked—it’s clean/);
  updateCoachAnswer(args.answers,'basketCondition','clean');
  assert.equal(shot('Bitter','Slow',args).key,'doseFit');
  for(const basketFit of ['yes','unknown']){
    const fast=shot('Sour','Fast',{gear:pressurized,actual:{},answers:{basketFit}});
    assert.equal(fast.key,'doseFit');
    assert.ok(!fast.checkClean);
  }
  const evenShot={...args,actual,answers:{...args.answers,doseFit:'yes',even:'yes'}};
  assert.match(shot('Bitter','Slow',evenShot).change,/33.3 g/);
  assert.equal(shot('Sour','Slow',{...evenShot,actual:{}}).key,'yield');
  assert.equal(shot('Mixed','Uneven',{gear:pressurized,actual:{}}).key,'unevenSource');
  assert.match(shot('Mixed','Uneven').patch.prep,/needle/);
});

test('changing conflicting answers invalidates only dependent observations',()=>{
  const answers={flow:'Fast',taste:'Sour',even:'no',doseFit:'yes',basketCondition:'clean',interruption:'yes'};
  updateCoachAnswer(answers,'flow','Steady');
  assert.deepEqual(answers,{flow:'Steady',taste:'Sour',doseFit:'yes',basketCondition:'clean'});
  assert.match(shot('Sour','Steady',{answers}).change,/38.7 g/);
  updateCoachAnswer(answers,'basket','Dual-wall / pressurized');
  assert.deepEqual(answers,{flow:'Steady',taste:'Sour',basket:'Dual-wall / pressurized'});
  assert.equal(coachGear({...gear,ratedDose:18},{basket:'Dual-wall / pressurized'}).ratedDose,undefined);
  assert.equal(coachGear(gear,{machine:'Capsule machine'}).basket,undefined);
  assert.match(shot('Too intense','Steady',{actual:{}}).change,/small splash/);
  const diluted=shot('Weak','Fast',{actual:{dose:18,yieldG:50},answers:{even:'yes'}});
  assert.match(diluted.change,/47.3 g/);
  assert.ok(!diluted.patch.grind);
});

test('fast preset-machine shots use the reported sharp or weak taste to recommend a specific next brew',()=>{
  const automatic={machine:'Automatic / bean-to-cup',basket:'Built-in basket',stop:'Preset or automatic only'};
  assert.equal(shot(undefined,'Fast',{gear:automatic}).key,'taste');
  for(const [taste,description] of [['Sour',/tasted sharp/],['Weak',/tasted thin/]]){
    const advice=shot(taste,'Fast',{gear:automatic,actual:{}});
    assert.equal(advice.kind,'diagnostic');
    assert.match(advice.because,description);
    assert.match(advice.change,/shorter espresso setting/);
    assert.equal(advice.test,true);
    assert.notEqual(advice.report,'taste');
  }
});

test('flat taste consumes an aroma answer with or without a tracked bean bag',()=>{
  for(const bag of [undefined,{method:'Original bag'}]){
    assert.equal(shot('Other','Steady',{bag,actual:{}}).key,'aroma');
    for(const aroma of ['yes','no','unknown']){
      const advice=shot('Other','Steady',{bag,actual:{},answers:{aroma}});
      assert.equal(advice.kind,'diagnostic');
      assert.notEqual(advice.report,'aroma');
      assert.match(advice.change,aroma==='yes'?/another portion/:/Warm up/);
    }
  }
});

test('weighing the next cup carries instructions into brewing before showing a fresh report',()=>{
  const state={bags:[],shots:[],preferences:{}};
  const advice=shot('Weak','Steady',{actual:{},answers:{noYield:true}});
  assert.equal(advice.title,'Weigh the next cup');
  const test={title:advice.title,instruction:advice.change,keep:advice.keep,report:advice.report};
  const recipe={gear,planned,test};
  for(const markup of [brewView({...recipe,step:3},state),brewView({...recipe,step:5,pouring:true},state)]){
    assert.match(markup,/Weigh the next cup[\s\S]*Place a scale under the cup[\s\S]*36 g/);
    assert.doesNotMatch(markup,/Report what happened|Sources|Elapsed time/);
  }
  const report=coachScreen({origin:recipe,screen:'test-result',actual:{},gear,answers:{}},state,null,null,false);
  assert.match(report,/Report what happened[\s\S]*Espresso in the cup/);
  assert.doesNotMatch(report,/name="yieldG" value="36"/);
});

test('dashboard always offers a fresh shot and continues only unfinished drafts',()=>{
  for(const draft of [null,{step:3},{step:6,savedId:'shot-1'},{step:8}]){
    const markup=home({draft,equipment:{}});
    assert.match(markup,/Start a new shot/);
    assert.match(markup,/My equipment/);
    assert.equal(markup.includes('Continue current shot'),draft?.step===3);
    assert.match(markup,/Skip for now/);
  }
  assert.doesNotMatch(home({equipment:{},equipmentSetupSkipped:true}),/Skip for now/);
});
