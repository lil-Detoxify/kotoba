export const onRequestGet = async () => new Response(JSON.stringify({error:'api_disabled', message:'Sync is reserved and currently disabled.'}), {status:501, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const onRequestPost = onRequestGet;
export const onRequestHead = async () => new Response(null, {status:501, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
