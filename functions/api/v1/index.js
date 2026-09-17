const disabled = () => new Response(JSON.stringify({error:'api_disabled',message:'The API v1 surface is reserved and currently disabled.'}), {status:501,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const onRequestGet = async () => disabled();
export const onRequestHead = async () => { const response=disabled(); return new Response(null,{status:response.status,headers:response.headers}); };
