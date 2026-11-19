export const offlineMessages = {
  pending: 'Checking offline availability…',
  ready: 'Ready to open offline in this browser. Photo label reading may still need its first download.',
  restricted: 'This browser window blocks offline setup. Open Morning Pull directly in a regular browser tab to try again. You can still use the app online.',
  unavailable: 'Offline setup is unavailable here. Open Morning Pull in a secure browser tab. Online use is still available.',
  signIn: 'The browser could not get the offline files with your current sign-in. Open Morning Pull directly, sign in if prompted, and try again.',
  badScript: 'This window received a web page instead of the offline worker. Open Morning Pull directly in your browser to try again.',
  incomplete: 'Offline setup did not finish. Stay online and try again. The app can still be used online.'
};

function hasOfflineFiles(worker) {
  if (!worker) return Promise.resolve(false);
  return new Promise(resolve => {
    const channel=new MessageChannel();
    const timeout=setTimeout(()=>finish(false),1500);
    function finish(ready) {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(ready);
    }
    channel.port1.onmessage=event=>finish(event.data===true);
    try { worker.postMessage('check-offline',[channel.port2]); }
    catch { finish(false); }
  });
}

export async function prepareOffline() {
  try {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return 'unavailable';
    const workers = navigator.serviceWorker;
    if (!navigator.onLine && await hasOfflineFiles(workers.controller)) return 'ready';
    const script = new URL('./sw.js', import.meta.url);
    const registration = await workers.register(script, {updateViaCache:'none'});
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) return 'incomplete';
    const status = await new Promise(resolve => {
      const timeout = setTimeout(() => finish('incomplete'), 15000);
      function finish(status) {
        clearTimeout(timeout);
        worker.removeEventListener('statechange', check);
        workers.removeEventListener('controllerchange', check);
        resolve(status);
      }
      function check() {
        if (worker.state === 'redundant') finish('incomplete');
        if (worker.state === 'activated' && workers.controller===worker) finish('check');
      }
      worker.addEventListener('statechange', check);
      workers.addEventListener('controllerchange', check);
      check();
    });
    return status==='check' && await hasOfflineFiles(workers.controller)?'ready':'incomplete';
  } catch (error) {
    try { if (await hasOfflineFiles(navigator.serviceWorker?.controller)) return 'ready'; } catch {}
    if (error.name === 'SecurityError' || /denied|not allowed|sandbox/i.test(error.message)) return 'restricted';
    try {
      const response = await fetch(new URL('./sw.js', import.meta.url), {credentials:'same-origin',cache:'no-store'});
      if ([401,403].includes(response.status) || response.redirected) return 'signIn';
      if (response.ok && !/(javascript|ecmascript)/i.test(response.headers.get('Content-Type')??'')) return 'badScript';
    } catch {}
    return 'incomplete';
  }
}
