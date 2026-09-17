const path=require('node:path');
function assetPath(url,root){
 try{const parsed=new URL(url);if(parsed.protocol!=='kotoba:'||parsed.host!=='app')return null;const decoded=decodeURIComponent(parsed.pathname);if(decoded.includes('\0')||decoded.includes('\\')||decoded.split('/').includes('..'))return null;const relative=decoded==='/'?'index.html':decoded.replace(/^\/+/, '');const result=path.resolve(root,relative);const prefix=path.resolve(root)+path.sep;return result.startsWith(prefix)?result:null}catch{return null}
}
module.exports={assetPath};
