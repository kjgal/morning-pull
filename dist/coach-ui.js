import { TIMING } from './core.js';
import { diagnosticQuestions, equipmentQuestions, openings } from './espresso-coach.js';
import { actions, bagName, btn, e, fields, form, heading, link, number, panel, select, shotNavigation, submit } from './ui.js';

const answerList=(options,value)=>`<div class="stack coach-choices">${options.map(([key,label])=>
  `<button type="button" data-action="coach-answer" data-value="${e(key)}" class="ghost"${key===value?' aria-current="true"':''}>${e(label)}</button>`).join('')}</div>`;
export function nextBaseline({grind,prep,heat,...plan}){return plan;}
export const followQuestions={
  taste:{key:'taste',title:'What did the coffee taste like?',options:openings.taste},
  flow:{key:'flow',title:'How did it come out?',options:openings.flow},
  yield:{key:'yield',title:'How many grams landed in the cup?',body:'Enter the measured weight of the espresso.'},
  dose:{key:'dose',title:'How many grams of dry coffee did you use?'},
  equipmentIssue:{key:'equipmentIssue',title:'Does plain water flow normally without coffee?',body:'Use the rinse instructions for your machine.',options:[['yes','Yes'],['no','No'],['unknown','Not sure']]},
  aroma:{key:'aroma',title:'Do the dry beans smell flat or stale?',options:[['yes','Yes'],['no','No'],['unknown','Not sure']]},
  ...diagnosticQuestions, ...equipmentQuestions
};

export function coachScreen(session,state,bag,outcome,direct){
  const {screen,actual}=session;
  const context=bag?`<p class="small">${e(bagName(bag))}</p>`:'';
  const back=session.trail?.length?actions(btn('Back','coach-back','','ghost')):'';
  let body;
  if(screen==='test-result'){
    const canMeasure=session.gear.scale==='Yes'||['yield','dose'].includes(session.origin.test.report);
    body=heading('Report what happened','Record what you noticed about this test shot.')+
      form('coach-test-result',fields(
        select('How did it taste?','taste',session.answers.taste??'unknown',[['Balanced','Tasted good'],...openings.taste])+
        select('How did it pour?','flow',session.answers.flow??'unknown',openings.flow)+
        (canMeasure?number('Espresso in the cup (g)','yieldG',actual.yieldG,'min=".1" max="500"')+
          number('Dry coffee (g)','dose',actual.dose,'min=".1" max="60"'):''))+
        actions(submit('Get feedback')));
  }else if(screen==='start'){
    body=heading('How was your coffee?')+answerList([['good','Tasted good'],['wrong','Something wasn’t right'],['describe','Help me describe it']]);
  }else if(screen==='notice'){
    body=heading('What did you notice first?')+answerList([['taste','It tasted off'],['flow','The pour looked off'],['unknown','Not sure']])+
      (direct?actions(btn('Choose coffee','coach-edit-item','context','ghost')):'');
  }else if(screen==='taste'){
    body=heading('What did it taste like?')+answerList(openings.taste,session.answers.taste)+actions(btn('Use my own words','coach-edit-item','note','ghost'));
  }else if(screen==='flow'){
    body=heading('How did it come out?')+answerList(openings.flow,session.answers.flow);
  }else if(screen==='confirm-note'){
    body=heading('Does this match?')+`<p>${e(session.note)}</p>`+answerList([['confirm',session.noteChoice],['unknown','Let me choose instead']]);
  }else if(screen==='edit'){
    const extra={grinder:'Grinder',machine:'Machine',basket:'Basket',scale:'Scale',stop:'Brew stop',temperature:'Temperature',
      basketFit:'Basket suitability',basketCondition:'Basket condition',doseFit:'Dose range',even:'Evenness',
      unevenSource:'Where it sputtered',equipmentIssue:'Plain-water flow'};
    const items=[['taste','Taste'],['flow','Pour'],...Object.entries(extra).filter(([key])=>session.answers[key]),
      ['yield','Measured yield'],['dose','Measured dose'],
      ...(actual.timeSource==='manual'?[['time','Independently measured time']]:[]),...(direct?[['context','Coffee']]:[])];
    body=heading('Edit answers')+`<div class="stack">${items.map(([key,label])=>btn(label,'coach-edit-item',key,'ghost')).join('')}</div>`;
  }else if(screen==='edit-context'){
    body=heading('Which coffee did you use?')+form('coach-context',select('Bean bag','bagId',session.bagId,
      [['','Untracked beans'],...state.bags.filter(b=>!b.archived||b.id===session.bagId).map(b=>[b.id,bagName(b)])])+
      select('Storage portion','portionId',session.portionId,[['','Main bag'],...(bag?.portions??[]).map(p=>[p.id,p.name])])+
      actions(submit('Use this coffee')));
  }else if(screen==='edit-note'){
    body=heading('What stood out?')+form('coach-note',`<label class="label">In your own words<textarea name="note" maxlength="350" required>${e(session.note)}</textarea></label>`+actions(submit('Continue')));
  }else if(outcome?.kind==='question'){
    body=heading(outcome.title)+(outcome.body?`<p class="small">${e(outcome.body)}</p>`:'');
    if(['yield','dose'].includes(outcome.key)){
      const cup=outcome.key==='yield';
      const field=cup?'yieldG':'dose';
      body+=form('coach-measure',number(cup?'Espresso in the cup (g)':'Dry coffee (g)',field,actual[field], 'min=".1" '+(cup?'max="500"':'max="60"')+' required')+
        actions(submit('Continue')+btn('I didn’t measure it','coach-answer','unknown','ghost')));
    }else if(outcome.key==='time'){
      body+=form('coach-time',fields(
        number('Measured seconds','seconds',actual.seconds,'min=".1" max="3600" required')+
        select('When you started timing','timing',actual.timing,Object.entries(TIMING)))+
        actions(submit('Use measured time')+btn('I didn’t time it','coach-clear-time','','ghost')));
    }else body+=answerList(outcome.options,session.answers[outcome.key]??session.gear[outcome.key]);
  }else{
    const advice=outcome;
    const status=session.undone?'Change undone. Your original targets are ready.':advice.summary;
    body=heading(advice.title)+`<p class="kicker">${advice.kind==='diagnostic'?'Diagnostic check':advice.kind==='change'?'One change to try':'Repeat'}</p>
      <h2 class="coach-label">What probably happened</h2><p>${e(advice.because)}</p>
      <h2 class="coach-label">Try this next</h2><p><strong>${e(advice.change)}</strong></p>
      ${advice.keep?`<h2 class="coach-label">Keep these the same</h2><p>${e(advice.keep)}</p>`:''}
      <h2 class="coach-label">${advice.kind==='diagnostic'?'What this tells you':'Why it helps'}</h2>
      <p class="small">${e(advice.why)}</p>
      ${advice.watch?`<p class="small">${e(advice.watch)}</p>`:''}
      ${status?`<p class="note" role="status">${e(status)}${!session.undone&&advice.patch?.prep?` · ${e(advice.patch.prep)}`:''}</p>`:''}`+
      actions((advice.test?btn('Brew a test shot','coach-try','','primary'):
        advice.kind!=='diagnostic'?btn('Use this for my next shot','coach-try','','primary'):
        advice.report?btn(advice.report==='equipmentIssue'?'Enter rinse result':'Enter check result','coach-report',advice.report,'primary'):'')+
        (advice.checkClean?btn('Already checked—it’s clean','coach-checked-clean','','ghost'):'')+
        (advice.patch&&!session.undone?btn('Undo','coach-undo','','ghost'):''))+
      actions(btn('Edit answers','coach-edit','','ghost')+
        (session.savedId?link('Saved in History','shot/'+session.savedId,'ghost'):btn('Save this result','coach-save','','ghost')));
    return panel(context+body+shotNavigation(),'coach-card');
  }
  return panel(context+body+back+(direct&&screen==='notice'?'<div id="connected-chat"></div>':'')+shotNavigation(),'coach-card');
}
