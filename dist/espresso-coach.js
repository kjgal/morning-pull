import { ratioOf, round, positive, measuredShotTime } from './core.js';

const manual = gear => ['Pump espresso machine','Manual lever'].includes(gear.machine) &&
  ['Single-wall / unpressurized','Dual-wall / pressurized'].includes(gear.basket);
const single = gear => manual(gear) && gear.basket==='Single-wall / unpressurized';
const ask = (key,title,options,body='') => ({kind:'question',key,title,options,body});
const options = {
  flow:[['Steady','It poured evenly'],['Fast','It rushed out'],['Slow','It barely dripped'],['Uneven','It sputtered, sprayed, or ran unevenly'],['Choked','Almost nothing came out'],['unknown','Not sure']],
  yesNo:[['yes','Yes'],['no','No'],['unknown','Not sure']]
};
export const openings = {
  taste:[['Sour','Sharp or sour, like lemon'],['Bitter','Bitter, like over-steeped tea'],['Dry','Drying or rough'],['Weak','Thin or watery'],['Too intense','Too strong'],['Mixed','Both sharp and bitter'],['Other','Flat or muted'],['unknown','Not sure']],
  flow:options.flow
};
const qFlow = () => ask('flow','How did it come out?',options.flow);

export const equipmentQuestions = {
  grinder:ask('grinder','Can you change how fine your grinder grinds?',[
    ['Adjustable espresso grinder','Yes, I can adjust the grinder'],['Pre-ground coffee','No, I use pre-ground coffee'],
    ['Fixed or limited grinder','No, my grinder has a fixed setting'],['unknown','Not sure']
  ]),
  machine:ask('machine','What kind of espresso machine are you using?',[
    ['Pump espresso machine','A pump machine with a removable handle'],['Manual lever','A manual lever machine'],
    ['Automatic / bean-to-cup','An automatic machine that grinds and brews'],['Capsule machine','A capsule machine'],['unknown','Not sure']
  ]),
  basket:ask('basket','What does the bottom of your coffee basket look like?',[
    ['Single-wall / unpressurized','Lots of holes on the outside bottom'],
    ['Dual-wall / pressurized','One small outlet or a second layer'],
    ['unknown','Not sure']
  ],'Look at the underside of the removable metal basket. Your machine may call these single-wall and dual-wall.'),
  scale:ask('scale','Can you weigh the espresso in the cup?',[
    ['Yes','Yes, I have a scale'],['No','No scale'],['unknown','Not sure']
  ]),
  stop:ask('stop','Can you stop brewing yourself at a chosen amount?',[
    ['Can stop at a chosen yield','Yes, I can stop it'],['Preset or automatic only','No, it only uses preset amounts'],['unknown','Not sure']
  ]),
  temperature:ask('temperature','Can you adjust the brew temperature?',[
    ['Adjustable','Yes, the machine has a temperature setting'],['Fixed','No, it’s fixed'],['unknown','Not sure']
  ])
};
export const diagnosticQuestions = {
  basketFit:ask('basketFit','Is this the right basket for this coffee?',options.yesNo,
    'Use the basket your machine recommends for the type of grounds you used.'),
  basketCondition:ask('basketCondition','What did you notice about the empty basket?',[
    ['clean','I checked. It’s clean and water passes freely.'],
    ['blocked','I saw a blockage, or water flowed poorly only with the empty basket in place.'],
    ['unknown','I haven’t checked or I’m not sure.']
  ],'Use your machine’s instructions to check. A poor rinse without the basket points to a different problem.'),
  doseFit:ask('doseFit','Did the dry dose fit the basket’s stated range?',options.yesNo,
    'If you couldn’t weigh the coffee or the range is unknown, choose Not sure.'),
  unevenSource:ask('unevenSource','Where did you see the uneven flow?',[
    ['edge','At the rim of the portafilter'],['outlet','From the normal outlet'],['unknown','Not sure']
  ]),
  even:ask('even','Apart from the speed, did the stream sputter or spray?',[
    ['yes','No, it looked even'],['no','Yes, it sputtered or sprayed'],['unknown','Not sure']
  ]),
  time:ask('time','Did you time the shot independently?',[],
    'A previous shot used a similar measured dose and yield. A time you measured can help compare the flow.')
};

export function updateCoachAnswer(answers,key,value) {
  if(answers[key]===value) return;
  const dependent={
    flow:['even','unevenSource','interruption'],
    taste:['repeat','aroma'],
    machine:['basket','basketFit','basketCondition','doseFit','equipmentIssue','unevenSource','warm','repeat','interruption'],
    basket:['basketFit','basketCondition','doseFit','unevenSource','interruption'],
    grinder:['basketFit','repeat'],
    even:['unevenSource']
  };
  for(const field of dependent[key]??[]) delete answers[field];
  answers[key]=value;
}
export function coachGear(gear={},answers={}){
  const next={...gear};
  const changedMachine=gear.machine&&gear.machine!=='Not sure'&&answers.machine&&answers.machine!=='unknown'&&answers.machine!==gear.machine;
  if(changedMachine){
    for(const key of ['basket','ratedDose','stop','temperature','infusion','timer','tamper','distribution','warmup']) delete next[key];
  }
  if(next.basket&&next.basket!=='Not sure'&&answers.basket&&answers.basket!=='unknown'&&answers.basket!==next.basket) delete next.ratedDose;
  for(const key of Object.keys(equipmentQuestions)){
    if(answers[key])next[key]=answers[key]==='unknown'?'Not sure':answers[key];
  }
  return next;
}
const missing=(key,gear,answers)=>!answers[key] && (!gear[key]||gear[key]==='Not sure');

export function evaluateEspresso({gear={},planned={},actual={},answers={},bag,portion,previous}={}){
  gear=coachGear(gear,answers);
  const taste=answers.taste;
  const flow=answers.flow;
  const sour=taste==='Sour';
  const harsh=taste==='Bitter'||taste==='Dry';
  const weak=taste==='Weak';
  const ratio=positive(actual.dose,60)&&positive(actual.yieldG,500)?ratioOf(actual.dose,actual.yieldG):null;
  const canWeigh=gear.scale==='Yes';
  const canStop=manual(gear)&&gear.stop==='Can stop at a chosen yield';
  const canGrind=single(gear) && gear.grinder==='Adjustable espresso grinder';
  const previousSeconds=previous?.actual?.seconds;
  const currentSeconds=measuredShotTime(actual)?actual.seconds:null;
  const comparableShot=measuredShotTime(previous?.actual) && previous.actual.timing!=='unknown' &&
    previous.gear?.machine===gear.machine && previous.gear?.basket===gear.basket && previous.gear?.grinder===gear.grinder &&
    previous.planned?.preInfusion===planned.preInfusion && ratio!==null &&
    positive(previous.actual.dose,60)&&positive(previous.actual.yieldG,500)&&Math.abs(actual.dose-previous.actual.dose)<=1&&
    Math.abs(actual.yieldG-previous.actual.yieldG)<=3&&positive(previousSeconds,3600);
  const comparableTime=comparableShot && previous.actual.timing===actual.timing && positive(currentSeconds,3600);
  const fact=ratio===null?'':'Measured ratio 1:'+round(ratio,2)+'.';
  const timeFact=comparableTime ? 'At a similar measured dose and yield, this took '+currentSeconds+' s versus '+previousSeconds+' s for the prior shot.' :
    positive(currentSeconds,3600)? 'Recorded time: '+currentSeconds+' s.':'';
  const result=(kind,title,because,change,keep,watch,why,sources,patch=null,summary='')=>({
    kind,title,because,change,keep,watch,why,sources,patch,summary,fact,timeFact
  });
  const diagnostic=(title,because,change,watch,sources,report='',keep='')=>({
    ...result('diagnostic',title,because,change,keep,'',watch,sources),report,
    test:['yield','dose','flow','even','unevenSource'].includes(report)
  });
  const uneven=flow==='Uneven'||answers.even==='no';
  const dual=manual(gear)&&gear.basket==='Dual-wall / pressurized';
  const slow=flow==='Slow'||flow==='Choked';
  const diluteRun=weak&&flow==='Fast'&&ratio>=2.5&&canStop;
  const cupTest=flow==='Steady'||(['Fast','Slow'].includes(flow)&&answers.even==='yes'&&(!canGrind||diluteRun));
  const checkDose=()=>diagnostic('Use the basket’s rated dose','You reported a dose outside the basket’s stated range.',
    'Use a dose within the range recommended for this basket.','Compare whether the pour becomes steadier and taste it before changing anything else.',
    ['machine'],'flow','Keep the coffee and grind the same.');
  if(taste==='Balanced') return result('repeat','Repeat the shot you liked','You liked the taste.','Use the same recipe.',
    'Keep the same beans and settings.','Check whether it tastes just as good next time.','Your taste is the standard for this comparison.',['taste']);
  function cleanBasket(){
    return {...diagnostic('Check the obstructed basket outlet','You saw a blockage, or flow was restricted only with the empty basket.',
      'With the basket removed and cool, clean it using your machine’s instructions. Then run the recommended empty-basket rinse.',
      'Look for water to pass freely through the basket before changing grind or yield. If it still doesn’t, use the machine’s troubleshooting guide.',
      ['machine'],'basketCondition','Leave your coffee recipe unchanged for this check.'),checkClean:true};
  }
  const quickOrSlow=['Fast','Slow','Choked'].includes(flow);
  const flowAndTaste=(flow==='Fast'&&(sour||weak)) || (flow==='Slow'&&harsh) || flow==='Choked';
  const steadyTaste=flow==='Steady'&&(sour||harsh||weak);
  const presetMachine=['Capsule machine','Automatic / bean-to-cup'].includes(gear.machine);
  const nonManualBasket=['Built-in basket','Capsule'].includes(gear.basket);
  if((flowAndTaste||flow==='Fast'&&!taste)&&!presetMachine&&!nonManualBasket&&gear.basket!=='Dual-wall / pressurized'&&missing('grinder',gear,answers)) return equipmentQuestions.grinder;
  if(!taste&&['Fast','Slow','Steady'].includes(flow)) return ask('taste','What did the coffee taste like?',openings.taste);
  const setupMatters=uneven||steadyTaste||(flowAndTaste&&gear.grinder==='Adjustable espresso grinder');
  if(setupMatters&&!nonManualBasket&&missing('machine',gear,answers)) return equipmentQuestions.machine;
  if((setupMatters||quickOrSlow)&&!presetMachine&&!nonManualBasket&&['Pump espresso machine','Manual lever'].includes(gear.machine)&&missing('basket',gear,answers)) return equipmentQuestions.basket;
  if(steadyTaste&&manual(gear)&&missing('stop',gear,answers)) return equipmentQuestions.stop;
  if(uneven&&dual){
    if(!answers.unevenSource) return diagnosticQuestions.unevenSource;
    if(answers.unevenSource==='edge') return diagnostic('Check the portafilter seal','You saw coffee escaping around the rim.',
      'Once the machine is safe to handle, wipe grounds from the basket rim. Reseat the portafilter as your manual describes.',
      'Look for a dry rim during the next pour. If it still leaks, check the seal using your machine’s troubleshooting guide.',
      ['machine'],'unevenSource','Keep the dose and grind the same.');
    if(answers.basketCondition==='blocked') return cleanBasket();
    if(answers.basketCondition==='clean') {
      if(!answers.doseFit) return diagnosticQuestions.doseFit;
      if(answers.doseFit==='no') return checkDose();
      return diagnostic('Compare a cup with the correct dose','Water passed through the empty basket, so a blocked outlet is less likely.',
        'Keep the usual grind and use a dose your basket is rated for. Watch where the stream emerges.',
        'Look for a steady stream from the outlet. Coffee coming from around the rim would point to fit or sealing.',
        ['machine'],'unevenSource','Keep the coffee and cup target the same.');
    }
    return diagnostic('Check where the uneven flow starts','The pressurized outlet shapes the visible stream, so sputtering alone doesn’t tell us how water moved through the grounds.',
      'Follow your machine’s instructions for an empty-basket rinse and check whether water passes through normally.',
      'Water that flows freely points back to the coffee or dose. Flow that is restricted only with the empty basket in place makes the basket worth checking.',
      ['machine'],'basketCondition','Leave the grind and cup target alone for this check.');
  }
  if(uneven && single(gear)){
    const needle=gear.distribution==='Needle distribution tool';
    return result('change','Water may have found an uneven path','You noticed spraying, sputtering, or an uneven stream.',
      needle?'Use your needle tool to break up clumps before leveling the grounds.':'Gently spread the grounds to an even level before tamping as usual.',
      'Keep the dose, grind and cup target the same.','Look for a steadier stream and less sharpness or dryness.',
      'Spraying can happen when water finds an easier path through part of the grounds. That’s called channeling. Spreading the grounds evenly before tamping helps water contact more of the coffee.',
      ['bed','taste'],{prep:needle?'Use your needle tool to break up clumps before leveling.':'Spread the grounds evenly before your usual tamp.'},'Puck preparation updated');
  }
  if(!flow && taste!=='Too intense') return qFlow();


  if(dual&&quickOrSlow){
    if(!answers.basketFit) return diagnosticQuestions.basketFit;
    if(answers.basketFit==='no') return diagnostic('Use the basket recommended for your coffee',
      'You said the basket doesn’t match the grounds you used.',
      'Use the basket your manual recommends for these grounds and dose within that basket’s stated range.',
      'Look for a steadier pour before changing the cup target.', ['machine'],'basketFit','Keep the coffee and cup target the same.');
  }
  if(slow&&answers.equipmentIssue==='no') return diagnostic('Check the machine’s water path','Plain water also flowed poorly without the coffee.',
    'Follow your machine’s troubleshooting instructions for poor water flow.',
    'Once plain water flows normally, compare the pour before changing dose, grind, or the cup target.', ['machine'],'equipmentIssue');
  if(manual(gear)&&slow&&answers.basketCondition==='blocked') return cleanBasket();
  if(manual(gear)&&(dual&&slow||flow==='Choked'||flow==='Slow'&&!canGrind)){
    if(!answers.basketCondition) return diagnosticQuestions.basketCondition;
  }
  if(manual(gear)&&quickOrSlow&&answers.doseFit==='no') return checkDose();

  const contradictory=(sour&&flow==='Slow')||((harsh||taste==='Mixed')&&flow==='Fast');
  if(contradictory && !answers.even) return ask('even','Was the stream even from side to side?',[
    ['yes','It looked even'],['no','I saw sputtering or spraying'],['unknown','Not sure']
  ],'Taste and pour speed suggest different explanations. Visible unevenness would change the first thing to try.');

  if(diluteRun&&!answers.even) return diagnosticQuestions.even;
  const grindDirection=(flow==='Fast'&&(sour||weak&&!diluteRun))?'finer':
    flow==='Slow'&&harsh||flow==='Choked'?'coarser':'';
  if(grindDirection&&canGrind&&comparableShot&&!positive(currentSeconds,3600)&&!answers.noTime) return diagnosticQuestions.time;
  // The eight-second difference prompts clarification for comparable independent measurements.
  const timeConflict=comparableTime && ((flow==='Fast'&&currentSeconds-previousSeconds>=8) ||
    (flow==='Slow'&&previousSeconds-currentSeconds>=8));
  const clarifyLongShot=single(gear)&&gear.machine==='Pump espresso machine'&&gear.infusion==='None'&&
    actual.timing==='start'&&flow==='Fast'&&positive(currentSeconds,3600)&&currentSeconds>=45;
  const timingNeedsReview=timeConflict||clarifyLongShot;
  if(grindDirection&&canGrind&&timingNeedsReview&&!answers.interruption) return ask('interruption','Was there a pause or early stop?',options.yesNo,timeFact);
  if(grindDirection&&canGrind&&(!timingNeedsReview||answers.interruption==='no')){
    const label=grindDirection==='finer'?'Grind a little finer':'Grind a little coarser';
    return result('change',grindDirection==='finer'?'The grounds may have offered too little resistance':'The grounds may have offered too much resistance',
      flow==='Choked'?'Almost nothing came out.':grindDirection==='finer'?'The shot rushed out and tasted sharp or thin.':'The shot barely dripped and tasted bitter or drying.',
      label+' using the smallest repeatable adjustment on your grinder.',
      'Keep the dry dose, preparation, temperature and target yield the same.',
      grindDirection==='finer'?'Look for a steadier stream and less sharpness or thinness.':'Look for a steady stream with less drying bitterness.',
      'The taste and pour speed both point to how easily water moved through the grounds. Finer grounds generally slow the stream, while coarser grounds let it pass more easily. A small adjustment lets you check this without changing the rest of the recipe.',
      ['bed','dial'],{grind:label},label);
  }
  if(flow==='Choked'||uneven){
    if(answers.equipmentIssue===undefined) return ask('equipmentIssue','Does plain water flow normally without the coffee?',options.yesNo,'Use your machine’s rinse instructions for this check.');
    if(answers.equipmentIssue==='no') return diagnostic('Check the machine’s water path','Plain water also flowed poorly.',
      'Follow your machine’s troubleshooting or cleaning instructions before pulling another shot.',
      'Once plain water flows normally, retry with the same coffee. A continuing problem points back to the basket or coffee.', ['machine']);
    if(manual(gear)&&!answers.doseFit) return diagnosticQuestions.doseFit;
    if(manual(gear)&&answers.doseFit==='no') return checkDose();
    if(answers.equipmentIssue==='yes') return diagnostic('Confirm what changes with coffee in the basket',
      'Plain water flowed normally, but the coffee pour was uneven or nearly stopped.',
      'Use the basket’s usual dose range, and follow its preparation and grind guidance for these grounds.',
      'If normal flow only returns with a different suitable coffee, the resistance came from the coffee rather than the machine.',
      ['machine'],'flow','Keep the machine and cup target the same.');
    return diagnostic('Try the machine’s rinse check','The flow was uneven or nearly stopped.',
      'Use your machine’s rinse cycle and watch whether water comes out steadily.',
      'A steady rinse points back to the coffee or basket. A weak rinse suggests checking the machine’s water path before changing the recipe.',
      ['machine'],'equipmentIssue');
  }

  if(manual(gear)&&quickOrSlow&&!canGrind){
    if(!answers.doseFit) return diagnosticQuestions.doseFit;
    if(!answers.even&&flow!=='Choked') return diagnosticQuestions.even;
  }

  if(cupTest&&(sour||harsh||weak)&&canStop&&ratio===null&&missing('scale',gear,answers)) return equipmentQuestions.scale;

  if(cupTest && canStop && (canWeigh||ratio!==null) && (sour||harsh||weak)){
    if(!positive(actual.yieldG,500)&&!answers.noYield) return ask('yield','How many grams landed in the cup?',[],'A measured amount tells us how to change the next cup target.');
    if(positive(actual.yieldG,500)&&!positive(actual.dose,60)&&!answers.noDose) return ask('dose','How many grams of dry coffee did you use?',[],'The dry dose lets us calculate a ratio from your measurements.');
    if(ratio!==null && ratio>=1.2 && ratio<=3.2){
      const direction=sour?1:-1;
      // A small house trial, bounded relative to the measured dose.
      const grams=round(Math.min(4,actual.dose*.15));
      const next=round(actual.yieldG+direction*grams);
      const nextRatio=round(next/actual.dose,4);
      if(grams>=1 && nextRatio>=1.1 && nextRatio<=3.4){
        const unchanged=planned.dose===actual.dose && positive(planned.ratio,10) && round(planned.dose*planned.ratio)===next;
        const label=unchanged?'Your current target is already '+next+' g.':'Next cup target: '+next+' g';
        const patch=unchanged?null:{dose:actual.dose,ratio:nextRatio};
        return result('change',sour?'A slightly longer yield may soften the sharp taste':weak?'The cup may be too diluted for your taste':taste==='Bitter'?'A slightly shorter yield may ease bitterness':'A slightly shorter yield may ease the drying finish',
          'The stream looked steady and you measured '+actual.yieldG+' g from '+actual.dose+' g of dry coffee.',
          'Stop at '+next+' g in the cup ('+(sour?'+':'−')+grams+' g).',
          'Use the same '+actual.dose+' g dose, grind, prep and temperature for the comparison.',
          sour?'Look for a rounder finish with enough body.':weak?'Look for a fuller cup with a clean finish.':taste==='Bitter'?'Look for less bitterness without making the cup too sharp.':'Look for less dryness without making the cup too sharp.',
          'You saw an even pour and know how much espresso reached the cup. At the same dose, a little more liquid usually extracts more flavor and makes the cup less concentrated. A little less does the reverse. Taste the next shot to see whether this helps.',
          ['taste','dial'],patch,label);
      }
    }
  }

  if(taste==='Too intense') return diagnostic('Check whether it’s the strength','The cup tasted too intense to you.',
    'Add a small splash of warm water to half a sip and compare it with the undiluted espresso.',
    'If the diluted sip tastes balanced, the strength may be what bothered you. If a sour or bitter taste remains, that flavor gives you a better clue.', ['taste']);

  if(flow==='Steady' && (sour||harsh) && manual(gear)){
    if(!answers.warm) return ask('warm','Had your machine warmed up according to its manual?',options.yesNo);
    if(answers.warm==='no') return result('change','A cold start may have affected the shot','You pulled the shot before the machine was fully warmed up.',
      'Let the machine warm up as its manual recommends before your next pull.',
      'Keep the same dose, grind and cup target.','Look for a more balanced taste after a consistent warm-up.',
      'Temperature can influence extraction. Confirm a consistent warm-up before trying a new temperature setting.',
      ['heat','machine'],{prep:'Warm up the machine as its manual recommends.'},'Warm-up guidance added');
    if(answers.warm==='yes' && ((sour&&bag?.roastLevel==='Light') || (harsh&&bag?.roastLevel==='Dark')) &&
        missing('temperature',gear,answers)) return equipmentQuestions.temperature;
    if(answers.warm==='yes'&&gear.temperature==='Adjustable'){
      if(!answers.repeat) return ask('repeat','Has the same taste happened more than once with this setup?',options.yesNo);
      if(answers.repeat==='yes' && ((sour&&bag?.roastLevel==='Light') || (harsh&&bag?.roastLevel==='Dark'))){
        const instruction='Try one available '+(sour?'warmer':'cooler')+' temperature increment within your machine’s recommended range.';
        return result('change','Temperature may be worth testing','The pour was steady, the machine was warmed up, and the same flavor repeated.',
          instruction,'Keep the dose, grind and cup target the same.','Look for less '+(sour?'sharpness':'dryness')+' at similar flow.',
          'Temperature, grind and flow can interact. This is a bounded comparison for a machine with confirmed temperature control.',
          ['heat','machine'],{heat:instruction},'Temperature trial added');
      }
    }
  }

  if(taste==='Other'){
    if(!answers.aroma) return ask('aroma','Do the dry beans also smell flat or stale?',options.yesNo);
    if(answers.aroma==='yes') return diagnostic('Compare the beans before changing the recipe',
      portion?.thawed?'The beans smell flat and this portion has been thawed.':'The dry beans smell flat too.',
      'If you have another portion of the same coffee that was stored separately, smell it beside this one.',
      'If the aromas differ clearly, compare portions before changing the recipe. If they smell alike, check whether the shot’s flow or measured yield changed.', ['beans']);
    return diagnostic('Try a fully warmed-up shot',
      answers.aroma==='no'?'The cup tasted flat, but the dry coffee smelled normal.':'The dry coffee’s aroma didn’t give us a clear clue.',
      'Warm up the machine as its manual recommends before brewing another cup.',
      'A consistent warm-up gives you a way to check whether starting temperature contributed to the muted flavor.',
      ['heat'],'flow','Keep the same beans and recipe.');
  }

  if(flow==='unknown') return diagnostic('Check the stream on your next shot','You weren’t sure how it flowed.',
    'Watch whether the stream stays even, rushes, or barely drips.',
    'Spraying points to checking preparation. A consistently rushing or slow stream gives the coach a reason to ask about grind and your equipment.', ['bed','dial'],'flow','Keep your usual dose and grind.');
  if(contradictory) return diagnostic('Check whether the same taste and flow repeat','The taste and flow point toward different first changes.',
    'Pull one more shot with the same setup and note whether the same taste returns at similar flow.',
    'If the stream sputters, investigate preparation. If it stays even and the taste repeats, compare measured yield or warm-up before changing grind.', ['bed','taste'],'flow','Keep the dose, grind and target yield the same.');
  if(flow==='Steady'&&canWeigh&&!positive(actual.yieldG,500)) return diagnostic('Weigh the next cup','You saw a steady pour without a measured yield.',
    'Place a scale under the cup and record the espresso weight when you stop.',
    'A measured yield and dose let the coach separate a cup-target change from a grind or warm-up check.', ['taste','dial'],'yield','Keep the dose and grind the same.');
  if(quickOrSlow&&presetMachine){
    if(sour||weak) return diagnostic('Try the espresso setting',
      sour?'The shot rushed out and tasted sharp. At a preset, pour speed alone gives limited information about the grind.':
        'The shot rushed out and tasted thin. A longer preset can dilute the coffee.',
      'If your machine offers a shorter espresso setting, use it for the next cup.',
      'A shorter preset uses less water. Taste the next cup to see whether the extra concentration suits this coffee.',
      ['machine','taste'],'flow','Keep the same coffee and other machine settings.');
    return diagnostic('Compare at your usual preset','The machine’s preset shapes the pour speed.',
      'Brew with your usual espresso preset and watch whether the stream is steady or sputters.',
      'An uneven pour can point to a different issue than a fast but steady stream.', ['machine','taste'],'flow');
  }
  if(quickOrSlow&&answers.even==='yes'&&canWeigh&&ratio===null) return diagnostic('Weigh the next cup',
    'The stream looked even, but we don’t know how much espresso reached the cup from that dose.',
    'Weigh the dry grounds and the espresso in the cup on your next pull.',
    'Use the measurements and taste to judge a cup-target change separately from flow.', ['taste','dial'],
    positive(actual.yieldG,500)?'dose':'yield','Keep the grind and machine settings the same.');
  if(quickOrSlow&&answers.even==='yes'&&manual(gear)&&!canGrind) return diagnostic('Check the coffee’s grind suitability',
    'The stream looked even, and this setup doesn’t support a confident grinder adjustment.',
    'Check whether your coffee is ground for the basket your machine recommends.',
    'If it is, compare the taste at a consistent dose before changing the cup target.', ['machine','taste'],'flow',
    'Use the same basket and brew setting for now.');
  if(quickOrSlow) return diagnostic('Check whether the pour stays even',
    answers.grinder==='unknown'||answers.basket==='unknown'||answers.machine==='unknown'
      ?'The pour speed stood out, and the setup is still uncertain.':'The pour speed stood out, but the available adjustments or flavor don’t point to a specific change.',
    'Watch whether the stream comes out evenly or sputters and sprays.',
    'An uneven stream points to how water is moving through the coffee. A steady stream makes the flavor a better guide for the next change.',
    ['bed','taste'],'even','Keep the same coffee and machine settings for this check.');
  return diagnostic('Pin down what tastes off','The observations so far could fit several causes.',
    'Take another sip as the espresso cools a little. Notice whether it seems sharp, dries your mouth, or just tastes lighter than you like.',
    'Those tastes lead to different checks. A thin cup can be a strength problem, while a sharp or drying finish may need a different adjustment.',
    ['taste'],'flow');
}
