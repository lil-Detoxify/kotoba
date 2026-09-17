export const onRequestGet = async () => new Response(JSON.stringify({authenticated:false, user:null, mode:'anonymous'}), {status:200, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const onRequestHead = async () => { const response=await onRequestGet({}); return new Response(null,{status:response.status,headers:response.headers}); };
