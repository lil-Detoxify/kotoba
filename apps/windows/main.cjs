const {app,BrowserWindow,protocol,net,shell,dialog}=require('electron');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const {assetPath}=require('./protocol.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'kotoba',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
// QA uses an isolated profile; normal launches always keep the same app data path.
const profile=process.argv.find(arg=>arg.startsWith('--kotoba-profile=')||arg.startsWith('--kotobud-profile='));if(profile)app.setPath('userData',path.resolve(profile.replace(/^--(kotoba|kotobud)-profile=/,'')));
let window;
const locked=app.requestSingleInstanceLock();if(!locked)app.quit();
else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus()}});
app.whenReady().then(()=>{
 const assets=app.isPackaged?path.join(process.resourcesPath,'web'):path.resolve(__dirname,'../../dist');
 protocol.handle('kotoba',async request=>{
  const file=assetPath(request.url,assets);if(!file)return new Response('Not found',{status:404});
  try{const response=await net.fetch(pathToFileURL(file).toString(),{headers:request.headers});const headers=new Headers(response.headers);headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; media-src 'self' https: http: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'");return new Response(response.body,{status:response.status,headers})}catch{return new Response('Not found',{status:404})}
 });
 window=new BrowserWindow({width:1280,height:900,minWidth:390,minHeight:640,title:'KotoBud · 日语背词',backgroundColor:'#f7f8f4',autoHideMenuBar:true,show:!process.argv.includes('--kotoba-test')&&!process.argv.includes('--kotobud-test'),icon:path.join(__dirname,'icon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 window.webContents.setWindowOpenHandler(({url})=>{try{const target=new URL(url);if(target.protocol==='https:')shell.openExternal(url);else if(target.protocol==='kotoba:'&&target.host==='app'&&/^\/dictionary\/[A-Z-]+\.md$/.test(target.pathname))return {action:'allow',overrideBrowserWindowOptions:{width:820,height:700,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}}}catch{}return {action:'deny'}});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('kotoba://app/')){event.preventDefault();try{if(new URL(url).protocol==='https:')shell.openExternal(url)}catch{}}});
 window.webContents.on('did-fail-load',(_event,code,description)=>{if(code!==-3)dialog.showErrorBox('KotoBud 加载失败',description)});
 window.loadURL('kotoba://app/');
});
app.on('window-all-closed',()=>app.quit());
}

