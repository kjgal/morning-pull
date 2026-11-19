import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseIngredient,parseRecipePage,parseRecipeText,loadRecipeLink,recipeURL} from '../dist/recipe-import.js';
import {scaleItems,emptyState} from '../dist/core.js';
import {importData} from '../dist/storage.js';
import {matchImportedRecipe} from '../dist/recipes.js';
import {recipeView,recipeEdit} from '../dist/views.js';

const link='https://recipes.example.org/coffee';
const recipe={'@type':'Recipe',name:'Coffee &amp; oat latte',recipeCategory:'Drinks',
  recipeIngredient:['1½ cups oat milk','2 shots espresso','1–2 tsp cinnamon','cocoa to taste'],
  recipeYield:['2 servings','400 mL'],
  recipeInstructions:[{'@type':'HowToSection',itemListElement:[{'@type':'HowToStep',text:'<b>Warm</b> the milk.'},
    {'@type':'HowToStep',text:'Add the espresso.'}]}]};
const page=data=>'<script type="application/ld+json">'+JSON.stringify(data)+'</script>';
const html=body=>new Response(body,{headers:{'Content-Type':'text/html; charset=utf-8'}});

test('link fetch parses structured recipes from a graph and returns every distinct choice',async()=>{
  const result=await loadRecipeLink(link,async(url,options)=>{
    assert.equal(url,link);
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'error');
    assert.equal(options.mode,'cors');
    return html(page({'@graph':[recipe,{...recipe,name:'Cinnamon Syrup',recipeCategory:'Syrup'},recipe]}));
  });
  assert.deepEqual(result.map(r=>r.name),['Coffee & oat latte','Cinnamon Syrup']);
  assert.equal(result[1].kind,'syrup');
  assert.equal(result[0].originalURL,link);
  assert.equal(result[0].yieldText,'2 servings / 400 mL');
  assert.deepEqual(result[0].steps,['Warm the milk.','Add the espresso.']);
  assert.equal(result[0].items[0].amount,1.5);
  assert.equal(result[0].items[0].unit,'cup');
  assert.equal(result[0].items[2].amount,null);
});

test('invalid, private-looking, unsupported, oversized and blocked links fail without guessing',async()=>{
  for(const url of ['file:///etc/hosts','https://10.0.0.1/a','https://0177.0.0.1/a','https://localhost/a','https://foo.internal/a',
    'https://[::1]/','https://user:pass@recipes.example.org/foo','https://recipes.example.org:8143/foo']) {
    assert.throws(()=>recipeURL(url),/public HTTPS/);
  }
  await assert.rejects(loadRecipeLink(link,async()=>html('<p>A webpage with no recipe</p>')),/No structured Recipe/);
  await assert.rejects(loadRecipeLink(link,async()=>new Response('',{status:401})),/did not return readable/);
  await assert.rejects(loadRecipeLink(link,async()=>html('a'.repeat(2_000_001))),/too large/);
  await assert.rejects(loadRecipeLink(link,async()=>{throw new TypeError('Fetch failed');}),/does not allow/);
  assert.deepEqual(parseRecipePage('<script>danger()</script><script type="application/ld+json">oops</script>',link),[]);
});

test('paste keeps unconfirmed quantities, yield, and original units through review and scaling',()=>{
  const parsed=parseRecipeText('Maple latte\nServings: 1 cup\nIngredients\n- ½ cup oat milk\n- 36 g espresso\n- maple syrup to taste (optional)\nDirections\n1. Warm the milk.\n2. Add espresso.');
  assert.equal(parsed.yieldText,'1 cup');
  assert.equal(parsed.items[2].amount,null);
  assert.equal(parsed.items[2].optional,true);
  assert.equal(scaleItems(parsed.items,2)[0].amount,1);
  assert.equal(scaleItems(parsed.items,2)[2].amount,null);
  assert.equal(parseIngredient('1 1/2 fl oz milk').unit,'fl oz');
  assert.equal(parseIngredient('2 (14 oz) cans milk').amount,null);
  assert.equal(parseIngredient('1 to 2 tsp cinnamon').amount,null);
  assert.match(recipeEdit({...parsed,imported:true},true),/Check the quantity/);
  const saved={...parsed,originalURL:link,id:'saved',imported:true,favorite:true};
  const backup={...emptyState(),recipes:[saved]};
  assert.deepEqual(importData(backup).recipes,[saved]);
  assert.throws(()=>importData({...backup,recipes:[{...saved,originalURL:'javascript:alert(1)'}]}));
  assert.match(recipeView(saved,true),/Original recipe/);
  assert.doesNotMatch(recipeView({...saved,items:[parsed.items[2]]},true),/Batch multiplier/);
  const checked=matchImportedRecipe(saved,{milk:'Oat milk',pantry:['espresso']});
  assert.deepEqual(checked.missing,['oat milk']);
  assert.deepEqual(checked.unchecked,[]);
});
