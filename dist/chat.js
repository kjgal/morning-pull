const endpoint = new URL('./api/coach-chat',import.meta.url);

// A deployment can implement GET for capability discovery and POST for a
// bounded, authenticated inference request. No provider keys enter the app.
export async function chatCapability() {
  try {
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(3500),cache:'no-store',redirect:'error'});
    if(!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const info=await response.json();
    return info.enabled===true && info.noFees===true && typeof info.provider==='string' ? info : null;
  }catch { return null; }
}
export function shotContext(shot,bag) {
  return {
    doseG:shot.actual.dose,yieldG:shot.actual.yieldG,seconds:shot.actual.seconds,timing:shot.actual.timing,tastes:shot.tastes,flows:shot.flows,
    roastLevel:bag?.roastLevel||null,storage:bag?.method||null,advice:shot.advice?.change||null
  };
}
export async function sendChat(message,context) {
  const response=await fetch(endpoint,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,context}),
    signal:AbortSignal.timeout(15000),cache:'no-store',redirect:'error'
  });
  if(response.status===429) throw new Error('Connected chat reached its free usage limit. You can use the built-in coach now.');
  if(!response.ok) throw new Error('Connected chat is unavailable. Try the built-in coach.');
  const data=await response.json();
  if(typeof data.reply!=='string'||!data.reply.trim()) throw new Error('Connected chat returned no response. Try the built-in coach.');
  return data.reply;
}
