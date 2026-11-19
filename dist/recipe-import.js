const MAX_PAGE = 2_000_000;
const FRACTIONS = {'¼':'1/4','½':'1/2','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8','⅕':'1/5','⅖':'2/5','⅗':'3/5','⅘':'4/5','⅙':'1/6','⅚':'5/6'};
const units = {
  g:/^(?:grams?|g)\b/i, mL:/^(?:millilit(?:er|re)s?|ml)\b/i, kg:/^(?:kilograms?|kg)\b/i,
  mg:/^(?:milligrams?|mg)\b/i, L:/^(?:lit(?:er|re)s?|l)\b/i, cup:/^cups?\b/i,
  tbsp:/^(?:tablespoons?|tbsp|tbs)\b\.?/i, tsp:/^(?:teaspoons?|tsp|tsps)\b\.?/i,
  'fl oz':/^(?:fluid ounces?|fl\.?\s*oz\.?)\b/i, oz:/^(?:ounces?|oz)\b\.?/i,
  lb:/^(?:pounds?|lbs?)\b\.?/i
};
export const recipeUnits = ['g','mL','count','kg','mg','L','cup','tbsp','tsp','fl oz','oz','lb'];
const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',frac12:'½',frac14:'¼',frac34:'¾',ndash:'–',mdash:'—'};
const plain = v => typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi,(full,key)=>{
  if(!key.startsWith('#')) return entities[key.toLowerCase()]??full;
  const code=/^#x/i.test(key)?parseInt(key.slice(2),16):Number(key.slice(1));
  return code>0&&code<=0x10ffff?String.fromCodePoint(code):full;
}).replace(/\s+/g,' ').trim():'';

export function recipeURL(value) {
  let url;
  try { url=new URL(value.trim()); } catch {}
  const host=url?.hostname;
  if(!url || url.protocol!=='https:' || url.username || url.password || url.port ||
     !/^(?:[a-z\d-]+\.)+[a-z][a-z\d-]*$/i.test(host) ||
     /\.(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/i.test(host)){
    throw new Error('Enter a public HTTPS recipe link.');
  }
  return url;
}

export function parseIngredient(value) {
  const original=plain(value);
  const optional=/\(optional\)\s*$/i.test(original);
  const text=original.replace(/\s*\(optional\)\s*$/i,'').replace(/[¼½¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚]/g,(v,index)=>(
    (/\d/.test(original[index-1]??'')?' ':'')+FRACTIONS[v]
  )).replace(/⁄/g,'/');
  const unknown={name:original.replace(/\s*\(optional\)\s*$/i,'').slice(0,250),amount:null,unit:'',optional};
  const match=/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)(?=\s|[a-z]|$)|^(\d+(?:\.\d+)?|\.\d+)(?=\s|[a-z]|[–—-]|$)/i.exec(text);
  if(!match || /\b(?:to taste|as needed|or more|divided)\b/i.test(text)) return unknown;
  const amount=match[4]===undefined?Number(match[1]??0)+Number(match[2])/Number(match[3]):Number(match[4]);
  let rest=text.slice(match[0].length).trim();
  if(!Number.isFinite(amount)||amount<=0||amount>100000||/^(?:[-–—/,.%(\d]|to\s+\d|x\s*\d|or\s+\d|one-half|a\s+pinch)/i.test(rest)) return unknown;
  let unit='count';
  for(const [label,pattern] of Object.entries(units)){
    const found=rest.match(pattern);
    if(!found) continue;
    unit=label;
    rest=rest.slice(found[0].length).trim().replace(/^of\s+/i,'');
    break;
  }
  if(unit==='count'&&(!/^\s/.test(text.slice(match[0].length))||/^(?:pinch|dash|handful|small splash|ounce|scoop|stick|packages?|bottles?)\b/i.test(rest))) return unknown;
  return rest&&!/^\d/.test(rest)?{name:rest.slice(0,250),amount,unit,optional}:unknown;
}

const instructionLines = value => {
  const parts=Array.isArray(value)?value:[value];
  return parts.flatMap(part=>{
    if(typeof part==='string') return part.split(/\r?\n|<\/li\s*>|<br\s*\/?\s*>/i).map(plain).filter(Boolean);
    if(part?.itemListElement) return instructionLines(part.itemListElement);
    if(part?.item) return instructionLines(part.item);
    return [plain(part?.text??part?.name)].filter(Boolean);
  });
};
function makeRecipe({name,category,description,yieldText,items,steps,originalURL=''}) {
  return {
    name:plain(name).slice(0,130),kind:/\bsyrup\b/i.test(plain(category))||/\bsyrup$/i.test(plain(name))?'syrup':'drink',
    description:plain(description).slice(0,150),yieldText:plain(yieldText).slice(0,150),
    items:items.slice(0,100),steps:steps.slice(0,100).map(step=>step.slice(0,2400)),originalURL
  };
}

export function parseRecipePage(html, originalURL) {
  const recipes=[];
  const seen=new Set();
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(!/\btype\s*=\s*["']?application\/ld\+json(?=["'\s;]|$)/i.test(script[1])) continue;
    let value;
    try { value=JSON.parse(script[2].trim()); } catch { continue; }
    const pending=[value];
    for(let i=0;i<pending.length&&i<10000&&recipes.length<25;i++){
      const node=pending[i];
      if(!node||typeof node!=='object') continue;
      if(![node['@type']].flat().some(type=>typeof type==='string'&&/(?:^|[/#])Recipe$/.test(type))){
        for(const child of Object.values(node)) if(child&&typeof child==='object') pending.push(child);
        continue;
      }
      const recipe=makeRecipe({
        name:node.name,category:[node.recipeCategory].flat().filter(Boolean).join(' '),description:node.description,
        yieldText:[node.recipeYield].flat().filter(Boolean).join(' / '),originalURL,
        items:[node.recipeIngredient].flat().map(parseIngredient).filter(item=>item.name),steps:instructionLines(node.recipeInstructions)
      });
      const fingerprint=JSON.stringify([recipe.name,recipe.items,recipe.steps]);
      if((recipe.name||recipe.items.length||recipe.steps.length)&&!seen.has(fingerprint)){
        recipes.push(recipe);
        seen.add(fingerprint);
      }
    }
  }
  return recipes;
}

export function parseRecipeText(value,originalURL='') {
  const lines=value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const fields={name:'',category:'',yieldText:'',items:[],steps:[],originalURL};
  let section='';
  for(const line of lines){
    const metadata=/^(servings?|batch yield|yield|makes|category|recipe name|name)\s*:\s*(.+)$/i.exec(line);
    if(metadata){
      const key=metadata[1].toLowerCase();
      fields[key==='category'?'category':key.endsWith('name')?'name':'yieldText']=metadata[2];
      continue;
    }
    const yieldLine=/^(?:serves|makes|yields)\s+(\d.+|\d)$/i.exec(line);
    if(yieldLine&&!section){ fields.yieldText=line; continue; }
    const heading=/^#{0,4}\s*(ingredients?|directions|method|instructions?|preparation|steps)\s*:?\s*(.*)$/i.exec(line);
    if(heading&&(!heading[2]||line.includes(':'))){
      section=/^ingredients?$/i.test(heading[1])?'items':'steps';
      if(!heading[2]) continue;
      if(section==='items') fields.items.push(parseIngredient(heading[2]));
      else fields.steps.push(plain(heading[2]));
      continue;
    }
    const entry=line.replace(/^[-*•]\s+/,'').replace(/^\d+[.)]\s+/,'');
    if(section==='items') fields.items.push(parseIngredient(entry));
    else if(section==='steps') fields.steps.push(plain(entry));
    else if(!fields.name&&!/^[\d•*]/.test(line)) fields.name=line.replace(/^#+\s+/,'');
    else if(parseIngredient(entry).amount!==null||/^[-*•]\s+/.test(line)) fields.items.push(parseIngredient(entry));
    else if(/^\d+[.)]\s+/.test(line)) {section='steps';fields.steps.push(plain(entry));}
  }
  if(!fields.items.length&&!fields.steps.length) throw new Error('Paste the recipe ingredients and directions. Include their headings if you can.');
  return makeRecipe({...fields,items:fields.items.filter(item=>item.name),steps:fields.steps.filter(Boolean)});
}

export async function loadRecipeLink(input,request=fetch) {
  const url=recipeURL(input);
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),8000);
  try {
    const response=await request(url.href,{
      credentials:'omit',mode:'cors',referrerPolicy:'no-referrer',redirect:'error',signal:abort.signal
    });
    if(!response.ok || !/^(text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type')??'')) {
      throw new Error('The page did not return readable recipe HTML.');
    }
    if(Number(response.headers.get('content-length'))>MAX_PAGE) throw new Error('The page is too large to read here.');
    const stream=response.body?.getReader();
    if(!stream) throw new Error('The page did not return any recipe text.');
    const decoder=new TextDecoder();
    let size=0;
    let html='';
    while(true){
      const part=await stream.read();
      if(part.done) break;
      size+=part.value.byteLength;
      if(size>MAX_PAGE){
        abort.abort();
        throw new Error('The page is too large to read here.');
      }
      html+=decoder.decode(part.value,{stream:true});
    }
    const recipes=parseRecipePage(html+decoder.decode(),url.href);
    if(!recipes.length) throw new Error('No structured Recipe data was found on this page.');
    return recipes;
  } catch(error) {
    if(error.name==='AbortError') throw new Error('The recipe page took too long to open.');
    if(error instanceof TypeError) throw new Error('This site does not allow a direct recipe import, or the link redirects or is unavailable.');
    throw error;
  } finally { clearTimeout(timer); }
}
