const ingredient = (name,amount,unit,key = '',optional = false) => ({name,amount,unit,key,optional});
const g = (name,amount,key,optional) => ingredient(name,amount,'g',key,optional);
const ml = (name,amount,key,optional) => ingredient(name,amount,'mL',key,optional);
const dissolve = 'Combine the sugar and water in a small saucepan. Warm gently and stir just until the sugar dissolves.';
const cool = 'Cool and transfer to a clean, covered container. Refrigerate.';
const syrup = (id,name,description,items,steps=[dissolve,cool]) => ({id,kind:'syrup',name,description,items,steps});
export const STORAGE_GUIDANCE = 'Refrigerate homemade syrup. Treat flavored batches as perishable. Do not store them at room temperature for later use unless you are following a tested preservation recipe.';
export const SYRUPS = [
  syrup('simple','Simple syrup','Neutral sweetness for espresso, tea, or iced drinks.',[g('Granulated sugar',100),g('Water',100)]),
  syrup('vanilla','Vanilla syrup','Soft vanilla with a clean finish.',[g('Granulated sugar',100),g('Water',100),ml('Vanilla extract',5)],[dissolve,'Take off the heat and stir in the vanilla extract.',cool]),
  syrup('brown','Brown sugar syrup','Light molasses and caramel notes.',[g('Brown sugar',100),g('Water',100)]),
  syrup('cinnamon-syrup','Cinnamon brown sugar syrup','Brown sugar warmed with whole cinnamon.',[g('Brown sugar',100),g('Water',100),ingredient('Cinnamon stick',1,'count')],[dissolve,'Add the cinnamon and simmer gently for 5 minutes. Take off the heat, steep for 10 minutes, then remove the stick.',cool]),
  syrup('orange-vanilla-syrup','Orange vanilla syrup','Bright citrus oils rounded with vanilla.',[g('Granulated sugar',100),g('Water',100),g('Orange peel, without white pith',5),ml('Vanilla extract',2.5)],[dissolve,'Take off the heat. Add the peel and steep for 10 minutes, then strain and stir in the vanilla.',cool]),
  syrup('ginger-syrup','Fresh ginger syrup','A crisp, spicy finish for cold coffee and tonics.',[g('Granulated sugar',100),g('Water',100),g('Thinly sliced fresh ginger',20)],[dissolve,'Add the ginger, simmer gently for 5 minutes, then take off the heat. Steep for 10 minutes and strain.',cool]),
  syrup('cardamom-syrup','Cardamom syrup','Floral spice for lattes and Americanos.',[g('Granulated sugar',100),g('Water',100),g('Lightly crushed green cardamom pods',2)],[dissolve,'Add the cardamom, simmer gently for 5 minutes, then take off the heat. Steep for 10 minutes and strain.',cool])
];

export const PANTRY = {
  espresso:'Espresso',water:'Water',ice:'Ice',milk:'Milk on hand',cocoa:'Unsweetened cocoa',
  cinnamon:'Ground cinnamon',orange:'Orange',cardamom:'Ground cardamom',tonic:'Tonic water'
};
export const FLAVORS = {
  simpleSyrup:'Simple syrup',vanillaSyrup:'Vanilla syrup',brownSyrup:'Brown sugar syrup',
  cinnamonSyrup:'Cinnamon syrup',orangeSyrup:'Orange vanilla syrup',gingerSyrup:'Ginger syrup',
  cardamomSyrup:'Cardamom syrup',maple:'Pure maple syrup'
};
export const MILKS = ['Whole dairy milk','2% dairy milk','Lactose-free dairy milk','Oat milk','Soy milk','Almond milk','Coconut milk'];
export const MILK_PREFERENCES = ['No milk','No preference',...MILKS];
const isDairyFree = diet => diet==='Dairy-free';
const plantMilk = /\b(?:oat|soy|soya|almond|coconut|rice|cashew|pea|plant|hemp|macadamia) (?:milk|drink)\b/i;
const safeLabel = /\b(?:dairy[- ]free|non[- ]dairy|vegan)\b/i;
const dairyRisk = /\b(?:milk|cream|creamer|butter|buttermilk|yogurt|cheese|whey|casein(?:ate)?|ghee|half[- ]and[- ]half|chocolate|sauce|topping|caramel|dulce de leche|toffee)\b/i;
const nameOf = item => item.name.replace(/,.+$/,'').trim();
const plainMilk = item => item.key==='milk'||/^(?:milk(?: of your choice)?|(?:whole|[12]%|skim|low-fat|lactose-free|dairy|evaporated|condensed)(?: dairy)? milk)$/i.test(nameOf(item))||plantMilk.test(nameOf(item))&&!/\b(?:chocolate|sauce|topping)\b/i.test(nameOf(item));
const dairySafe = name => safeLabel.test(name)||!dairyRisk.test(name)||(plantMilk.test(name)&&!/\b(?:chocolate|sauce|topping|cream|butter)\b/i.test(name));
export const milkFor = (milk,diet) => {
  if(milk==='No milk') return milk;
  if(!MILKS.includes(milk)) return isDairyFree(diet)?'Unsweetened plant milk':'Milk of your choice';
  return isDairyFree(diet)&&MILKS.indexOf(milk)<3?'Oat milk':milk;
};
export function matchesDrinkPreference(recipe,{milk,diet}){
  const selected=milkFor(milk,diet);
  return recipe.items.every(item=>{
    if(milk==='No milk'&&(plainMilk(item)||/\b(?:milk|cream|creamer|whey|casein(?:ate)?|butter)\b/i.test(item.name))) return false;
    if(isDairyFree(diet)&&!dairySafe(item.name)) return false;
    if(plainMilk(item)&&MILKS.includes(selected)&&!/^milk(?: of your choice)?$/i.test(nameOf(item))) return selected.toLowerCase()===nameOf(item).toLowerCase();
    return true;
  });
}
export function drinks({temp='Hot',milk,diet,sweet,strength,pantry=[],otherSyrup=''}) {
  const iced = temp === 'Iced';
  const milkChoice = milkFor(milk,diet);
  if(isDairyFree(diet)&&!dairySafe(otherSyrup)) otherSyrup='';
  const espresso = g('Brewed espresso', {Gentle:25,Regular:36,Bold:50}[strength] ?? 36,'espresso');
  const cold = iced ? [g('Ice',100,'ice')] : [];
  const syrupAmount = {Unsweetened:0,Light:5,Regular:10,Sweet:15}[sweet] ?? 5;
  const chosenSyrup=Object.keys(FLAVORS).find(k=>pantry.includes(k)) ?? (otherSyrup?'otherSyrup':'simpleSyrup');
  const flavored = (key,optional=false) => ml(key==='otherSyrup'?otherSyrup:FLAVORS[key],syrupAmount,key,optional);
  const sweetener = syrupAmount ? [flavored(chosenSyrup,true)] : [];
  const sweetStep = sweetener.length?'If you want it sweeter, stir in the optional syrup. Start with less if yours is concentrated.':'';
  const milkSwap=diet==='Dairy-free'?'Swap in another unsweetened plant milk.':'Use another milk you enjoy, including an unsweetened plant milk.';
  const addMilk=iced?'Add ice and cold milk, then pour in the espresso and stir.':'Warm the milk, froth if you like, then pour it into the espresso.';
  const milkIdea = (id,name,description,extra=[],first='',swaps=[],amount=145,last=sweetStep) =>
    idea(id,name,description,[...extra,ml(milkChoice,amount,'milk'),...cold],[first,addMilk,last],[milkSwap,...swaps],
      [first,iced?'Add the ice and cold milk to your espresso, then stir.':'Warm the milk, froth if you like, and add it to your espresso.',last]);
  const idea = (id,name,description,items,steps,swaps=[],cupSteps=steps) => ({
    id,ideaKey:temp.toLowerCase()+'/'+id,kind:'drink',name:iced?'Iced '+name:name,temp,description,items:[espresso,...items],steps:steps.filter(Boolean),cupSteps:cupSteps.filter(Boolean),swaps
  });
  const flavoredLatte=(id,name,desc,key,extra=[],extraStep='',swap='')=>
    milkIdea(id,name,desc,[flavored(key),...extra],'Stir the measured syrup into the espresso. '+extraStep,swap?[swap]:[],145,'Taste before adding more syrup.');

  const ideas = [
    idea('americano','Americano','Straightforward espresso flavor with a lighter body.',[ml('Water',125,'water'),...cold,...sweetener],
      [iced?'Pour the espresso over ice and cold water.':'Pour the espresso into hot water.',sweetStep],['Use a little less water for a fuller cup.'],
      [iced?'Add the cold water and ice to your espresso, then stir.':'Add the hot water to your espresso and stir.',sweetStep]),
    milkIdea('latte','Silky Latte','Soft espresso with a creamy finish.',sweetener),
    milkIdea('mocha','Dark Cocoa Mocha','Deep cocoa with a bittersweet finish.',[g('Unsweetened cocoa',5,'cocoa'),...sweetener],
      'Whisk the cocoa into the warm espresso until smooth.',['For a milder chocolate flavor, use half the cocoa.']),
    milkIdea('cinnamon','Cinnamon Cortado','A small, espresso-forward drink with warm spice.',[g('Ground cinnamon',.3,'cinnamon'),...sweetener],
      'Whisk the cinnamon into the espresso.',['Use a pinch of cardamom for a floral variation.'],55),
    milkIdea('orange-mocha','Orange Peel Mocha','Dark chocolate with a bright orange aroma.',[g('Unsweetened cocoa',5,'cocoa'),g('Orange peel',2,'orange'),...sweetener],
      'Whisk cocoa into the espresso. Twist the peel over it, stir the peel in briefly, then remove it.',['Try a little orange vanilla syrup instead of peel if you want a sweeter drink.']),
    milkIdea('cardamom','Cardamom Latte','Floral, citrusy spice with a creamy finish.',[g('Ground cardamom',.25,'cardamom'),...sweetener],
      'Whisk the ground cardamom into warm espresso.',['Try ground cinnamon for a warmer, less floral flavor.'])
  ];
  if(syrupAmount){
    ideas.push(
      flavoredLatte('maple-cinnamon','Maple Cinnamon Latte','Woodsy maple and a warming cinnamon finish.','maple',[g('Ground cinnamon',.3,'cinnamon',true)],'If you have cinnamon, whisk in a pinch.','Brown sugar syrup gives a similar caramel note.'),
      flavoredLatte('vanilla-cardamom','Vanilla Cardamom Latte','Rounded vanilla with a floral spice note.','vanillaSyrup',[g('Ground cardamom',.25,'cardamom',true)],'Whisk in the cardamom if you have it.','Use cardamom syrup if you prefer a stronger spice note.'),
      flavoredLatte('brown-sugar','Brown Sugar Latte','Molasses sweetness that stands up to bold espresso.','brownSyrup',[],'','Swap in cinnamon syrup for a spiced version.'),
      flavoredLatte('orange-vanilla','Orange Vanilla Latte','Orange zest and soft vanilla, like a creamsicle with espresso.','orangeSyrup',[],'','Use vanilla syrup and twist a strip of orange peel over the finished drink.'),
      ...['gingerSyrup','cardamomSyrup','cinnamonSyrup'].filter(key=>pantry.includes(key)).map(key=>
        flavoredLatte('latte-'+key,FLAVORS[key].replace(' syrup','')+' Latte','A creamy latte flavored with the spiced syrup you have.',key)),
      ...(otherSyrup?[flavoredLatte('personal-syrup','Latte with '+otherSyrup,'Creamy espresso with the syrup you entered.','otherSyrup')]:[])
    );
  }
  if(iced) ideas.push(idea('tonic','Espresso Tonic','Bubbly and pleasantly bitter, with optional citrus aroma.',
    [ml('Tonic water',125,'tonic'),...cold,g('Orange peel',2,'orange',true),...(syrupAmount?[flavored('gingerSyrup',true)]:[])],
    ['Pour tonic over ice, then slowly add the espresso to limit foaming.','If you have orange, twist a strip of peel over the glass.',syrupAmount?'Try a splash of ginger syrup if you have it and want a sweeter finish.':''],
    ['If you are out of tonic, use sparkling water for a drier drink with less bitterness.'],
    ['Add ice and slowly pour tonic into your espresso to limit foaming.','If you have orange, twist a strip of peel over the glass.']));
  const available=new Set([...pantry,...(otherSyrup?['otherSyrup']:[])]);
  return ideas.filter(item=>milkChoice!=='No milk'||!item.items.some(i=>i.key==='milk')).map(item => ({...item,missing:item.items.filter(i=>!i.optional&&!available.has(i.key)).map(i=>i.name)}))
    .sort((a,b)=>a.missing.length-b.missing.length);
}

const pantryAliases = {
  ...PANTRY,...FLAVORS,
  espresso:'espresso|brewed espresso|espresso shots?|shots? (?:of )?espresso',
  water:'water|hot water|cold water|filtered water',
  ice:'ice|ice cubes?',
  cocoa:'(?:unsweetened )?cocoa(?: powder)?',
  cinnamon:'(?:ground )?cinnamon',
  cardamom:'(?:ground )?cardamom',
  orange:'oranges?|orange peel|orange zest',
  tonic:'(?:cold )?tonic(?: water)?',
  maple:'(?:pure )?maple syrup'
};
const pantryMatchers = Object.entries(pantryAliases).filter(([key])=>key!=='milk')
  .map(([key,pattern])=>[key,new RegExp('^(?:'+pattern+')$','i')]);
function ingredientAvailability(recipe,{milk,diet,pantry=[],otherSyrup=''}) {
  const selectedMilk=milkFor(milk,diet);
  const missing=[],unchecked=[];
  for(const item of recipe.items.filter(item=>!item.optional)){
    const name=nameOf(item).toLowerCase();
    const key=item.key||(name===selectedMilk.toLowerCase()||name==='milk'?'milk':
      otherSyrup&&[otherSyrup.toLowerCase(),otherSyrup.toLowerCase()+' syrup'].includes(name)?'otherSyrup':
      pantryMatchers.find(([,label])=>label.test(name))?.[0]);
    if(!key) unchecked.push(item.name);
    else if(key!=='otherSyrup'&&!pantry.includes(key)) missing.push(item.name);
  }
  return {...recipe,missing,unchecked};
}
function withPreferredMilk(recipe,options){
  const selected=milkFor(options.milk,options.diet);
  if(!MILKS.includes(selected)) return recipe;
  const replaceable=item=>item.key==='milk'||/^milk(?: of your choice)?$/i.test(nameOf(item));
  return {...recipe,items:recipe.items.map(item=>replaceable(item)?{...item,name:selected,key:'milk'}:item)};
}
export function matchImportedRecipe(recipe,options){
  const matched=recipe.kind==='drink'?withPreferredMilk(recipe,options):recipe;
  return matched.imported?ingredientAvailability(matched,options):matched;
}
const isEspresso = item => item.key==='espresso'||pantryMatchers.find(([key])=>key==='espresso')[1].test(nameOf(item));
export const drinkAdditions = recipe => recipe.items.filter(item=>!isEspresso(item));
export function brewedDrinkChoices(saved,options){
  const available={...options,pantry:[...options.pantry,'espresso']};
  const candidates=saved.filter(r=>r.kind==='drink'&&r.items.some(isEspresso))
    .map(r=>withPreferredMilk(r,options))
    .filter(r=>matchesDrinkPreference(r,options))
    .map(r=>ingredientAvailability(r,available));
  const favorites=candidates.filter(r=>r.favorite);
  const ideas=drinks(available).filter(r=>!candidates.some(saved=>saved.ideaKey===r.ideaKey||
    !saved.ideaKey&&saved.temp===r.temp&&saved.name===r.name));
  const suggestions=[...ideas,...candidates.filter(r=>!r.favorite)].filter(r=>!r.missing.length&&!r.unchecked?.length);
  return {favorites,suggestions};
}
