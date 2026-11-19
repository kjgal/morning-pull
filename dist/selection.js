let sequence=0;
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function selection(label,name,value,choices,attrs='') {
  const key='selection-'+ ++sequence;
  const items=choices.map(entry=>Array.isArray(entry)?entry:[entry,entry]);
  const index=Math.max(0,items.findIndex(([id])=>String(id)===String(value??'')));
  const display=item=>item?.[1]||'Not specified';
  return `<div class="label selection"><span id="${key}-label">${safe(label)}</span>
    <button type="button" class="selection-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="selection-panel"
      aria-labelledby="${key}-label ${key}-value"><span id="${key}-value">${safe(display(items[index]))}</span></button>
    <select hidden name="${safe(name)}" ${attrs}>${items.map(([id,caption],i)=>`<option value="${safe(id)}"${i===index?' selected':''}>${safe(caption||'Not specified')}</option>`).join('')}</select></div>`;
}

export function enableSelection(scope){
  const panel=document.createElement('dialog');
  panel.id='selection-panel';
  panel.className='selection-panel';
  panel.setAttribute('aria-labelledby','selection-title');
  panel.innerHTML='<div class="selection-header"><h2 id="selection-title"></h2><button type="button" class="ghost">Close</button></div><ul class="selection-options" role="listbox" aria-labelledby="selection-title"></ul>';
  document.body.append(panel);
  const title=panel.querySelector('h2');
  const dismiss=panel.querySelector('button');
  const list=panel.querySelector('ul');
  let trigger, field, options=[];
  let search='', lastKey=0;
  function focusOption(index) {
    options.forEach((option,i)=>{option.tabIndex=i===index?0:-1;});
    options[index]?.focus();
  }
  function position() {
    if(!panel.open||!trigger?.isConnected)return;
    const anchor=trigger.getBoundingClientRect();
    const viewWidth=document.documentElement.clientWidth;
    const viewHeight=window.innerHeight;
    const width=Math.min(viewWidth-24,Math.max(240,Math.min(420,anchor.width)));
    const height=Math.min(420,viewHeight-24,panel.scrollHeight+2);
    const left=Math.max(12,Math.min(anchor.left,viewWidth-width-12));
    const below=viewHeight-anchor.bottom-12;
    const above=anchor.top-12;
    const top=below>=height||below>=above?Math.min(anchor.bottom+6,viewHeight-height-12):anchor.top-height-6;
    panel.style.setProperty('--menu-width',width+'px');
    panel.style.setProperty('--menu-left',left+'px');
    panel.style.setProperty('--menu-top',Math.max(12,top)+'px');
  }
  scope.addEventListener('click',event=>{
    const element=event.target.closest('button.selection-trigger');
    if(!element||panel.open)return;
    trigger=element;
    field=trigger.closest('.selection').querySelector('select');
    title.textContent=trigger.previousElementSibling.textContent;
    search='';
    options=Array.from(field.options,(choice,i)=>{
      const item=document.createElement('li');
      item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(choice.selected));
      item.className='selection-option';
      item.dataset.index=String(i);
      item.textContent=choice.textContent;
      item.tabIndex=-1;
      return item;
    });
    list.replaceChildren(...options);
    trigger.setAttribute('aria-expanded','true');
    panel.showModal();
    position();
    focusOption(Math.max(0,field.selectedIndex));
  });
  function close() {
    panel.close();
    trigger?.setAttribute('aria-expanded','false');
    if(trigger?.isConnected)trigger.focus({preventScroll:true});
  }
  function choose(index) {
    if(!field?.options[index])return;
    const changed=field.selectedIndex!==index;
    field.selectedIndex=index;
    trigger.querySelector('span').textContent=field.options[index].textContent;
    close();
    if(changed){
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  panel.addEventListener('cancel',event=>{event.preventDefault();close();});
  dismiss.addEventListener('click',close);
  panel.addEventListener('click',event=>{
    if(event.target!==panel)return;
    const box=panel.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();
  });
  list.addEventListener('click',event=>{
    const option=event.target.closest('[role="option"]');
    if(option)choose(Number(option.dataset.index));
  });
  list.addEventListener('keydown',event=>{
    const index=options.indexOf(event.target);
    if(index<0)return;
    const last=options.length-1;
    if(['Enter',' '].includes(event.key)){event.preventDefault();choose(index);return;}
    const positions={ArrowUp:index>0?index-1:last,ArrowDown:index<last?index+1:0,Home:0,End:last};
    if(Object.hasOwn(positions,event.key)){event.preventDefault();focusOption(positions[event.key]);return;}
    if(event.key.length!==1||event.altKey||event.ctrlKey||event.metaKey)return;
    const now=Date.now();
    const letter=event.key.toLowerCase();
    search=now-lastKey>650?letter:search+letter;
    lastKey=now;
    const choices=[...options.slice(index+1),...options.slice(0,index+1)];
    const hit=choices.find(option=>option.textContent.toLowerCase().startsWith(search));
    if(hit){event.preventDefault();focusOption(options.indexOf(hit));}
  });
  window.addEventListener('resize',position);
  window.addEventListener('hashchange',()=>{if(panel.open)close();});
}
