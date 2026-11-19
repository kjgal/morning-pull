// A same-URL history entry lets Back dismiss the confirmation without leaving its screen.
export function createConfirmation(){
  const dialog=document.createElement('dialog');
  dialog.className='cafe-dialog confirmation';
  dialog.setAttribute('aria-labelledby','confirmation-title');
  dialog.setAttribute('aria-describedby','confirmation-message');
  dialog.innerHTML=`<div class="cafe-dialog-header">
    <h2 id="confirmation-title"></h2>
    <button type="button" class="ghost" data-dismiss>Close</button>
  </div>
  <div class="dialog-body">
    <p id="confirmation-message"></p>
    <div class="actions">
      <button type="button" class="primary" data-keep autofocus></button>
      <button type="button" class="ghost danger" data-approve></button>
    </div>
  </div>`;
  document.body.append(dialog);
  const title=dialog.querySelector('h2');
  const message=dialog.querySelector('p');
  const keep=dialog.querySelector('[data-keep]');
  const approve=dialog.querySelector('[data-approve]');
  const dismiss=dialog.querySelector('[data-dismiss]');
  let sequence=0;
  let pending=false;

  return function confirmAction(opener,{heading,description,cancelLabel,actionLabel}){
    if(pending) return Promise.resolve(false);

    title.textContent=heading;
    message.textContent=description;
    keep.textContent=cancelLabel;
    approve.textContent=actionLabel;
    const marker=++sequence;
    const url=location.href;
    history.pushState({...history.state,morningPullConfirmation:marker},'',url);
    pending=true;
    dialog.showModal();
    keep.focus({preventScroll:true});

    return new Promise(resolve=>{
      const events=new AbortController();
      const {signal}=events;
      let decision;
      function finish(confirmed){
        events.abort();
        pending=false;
        if(dialog.open) dialog.close();
        if(!confirmed&&opener?.isConnected) opener.focus({preventScroll:true});
        resolve(confirmed);
      }
      function close(confirmed){
        if(decision!==undefined) return;
        decision=confirmed;
        history.back();
      }
      keep.addEventListener('click',()=>close(false),{signal});
      dismiss.addEventListener('click',()=>close(false),{signal});
      approve.addEventListener('click',()=>close(true),{signal});
      dialog.addEventListener('cancel',event=>{
        event.preventDefault();
        close(false);
      },{signal});
      dialog.addEventListener('close',()=>close(false),{signal});
      dialog.addEventListener('click',event=>{
        if(event.target!==dialog) return;
        const {left,right,top,bottom}=dialog.getBoundingClientRect();
        if(event.clientX<left||event.clientX>right||event.clientY<top||event.clientY>bottom) close(false);
      },{signal});
      window.addEventListener('popstate',event=>{
        if(event.state?.morningPullConfirmation!==marker) finish(decision===true&&location.href===url);
      },{signal});
    });
  };
}
