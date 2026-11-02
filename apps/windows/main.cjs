const {app,BrowserWindow,protocol,net,shell,dialog,ipcMain}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
const {assetPath}=require('./protocol.cjs');

const tProcessStart = Date.now();
const startupMetrics = {
  processStart: tProcessStart,
  appReady: 0,
  windowCreated: 0,
  domReady: 0,
  didFinishLoad: 0
};
console.log(`[STARTUP] process start: ${new Date(tProcessStart).toISOString()}`);

protocol.registerSchemesAsPrivileged([{scheme:'kotoba',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
// QA uses an isolated profile; normal launches always keep the same app data path.
const profile=process.argv.find(arg=>arg.startsWith('--kotoba-profile=')||arg.startsWith('--kotobud-profile='));
if(profile)app.setPath('userData',path.resolve(profile.replace(/^--(kotoba|kotobud)-profile=/,'')));
const testMode=process.argv.includes('--kotoba-test')||process.argv.includes('--kotobud-test');
const testWebRootArg=testMode?process.argv.find(arg=>arg.startsWith('--kotobud-web-root=')):null;
const testWebRoot=testWebRootArg?path.resolve(testWebRootArg.slice('--kotobud-web-root='.length)):null;
if(testWebRoot){
  const reviewRoot=path.resolve(__dirname,'../../review/windows');
  const relative=path.relative(reviewRoot,testWebRoot);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)){
    throw new Error('--kotobud-web-root must point to a child of review/windows');
  }
}

app.setAppUserModelId('app.kotobud.desktop');

let window;
const locked=app.requestSingleInstanceLock();
if(!locked) {
  app.quit();
} else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus()}});

  ipcMain.handle('kotobud:is-portable', () => {
    return Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
  });

  ipcMain.handle('kotobud:create-desktop-shortcut', async () => {
    try {
      const desktopDir = app.getPath('desktop');
      const shortcutPath = path.join(desktopDir, 'KotoBud.lnk');
      const targetExe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      const icon = path.join(__dirname, 'icon.ico');

      const success = shell.writeShortcutLink(shortcutPath, 'create', {
        target: targetExe,
        args: '',
        description: 'KotoBud - 日语背词与日语学习',
        icon: fs.existsSync(icon) ? icon : targetExe,
        iconIndex: 0,
        appUserModelId: 'app.kotobud.desktop'
      });

      console.log(`[SHORTCUT] Created desktop shortcut pointing to ${targetExe}: success=${success}`);
      return { success, path: shortcutPath };
    } catch (err) {
      console.error('[SHORTCUT] Failed to create shortcut:', err);
      return { success: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('kotobud:get-startup-metrics', () => {
    return startupMetrics;
  });

  app.whenReady().then(()=>{
    startupMetrics.appReady = Date.now();
    console.log(`[STARTUP] app.whenReady in ${startupMetrics.appReady - tProcessStart}ms`);

    const assets=app.isPackaged?path.join(process.resourcesPath,'web'):(testWebRoot??path.resolve(__dirname,'../../dist'));
    protocol.handle('kotoba',async request=>{
      const file=assetPath(request.url,assets);if(!file)return new Response('Not found',{status:404});
      try{
        const response=await net.fetch(pathToFileURL(file).toString(),{headers:request.headers});
        const headers=new Headers(response.headers);
        headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; media-src 'self' https: http: blob:; object-src 'none'; frame-src 'none'; base-uri 'none'");
        return new Response(response.body,{status:response.status,headers});
      }catch{
        return new Response('Not found',{status:404});
      }
    });

    const iconFile = (process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'icon.ico')))
      ? path.join(__dirname, 'icon.ico')
      : path.join(__dirname, 'icon.png');

    window=new BrowserWindow({
      width:1280,
      height:900,
      minWidth:390,
      minHeight:640,
      title:'KotoBud · 日语背词',
      backgroundColor:'#f7f8f4',
      autoHideMenuBar:true,
      show:!process.argv.includes('--kotoba-test')&&!process.argv.includes('--kotobud-test'),
      icon:iconFile,
      webPreferences:{
        nodeIntegration:false,
        contextIsolation:true,
        sandbox:false,
        preload:path.join(__dirname, 'preload.cjs'),
        webSecurity:true
      }
    });

    startupMetrics.windowCreated = Date.now();
    console.log(`[STARTUP] window created in ${startupMetrics.windowCreated - tProcessStart}ms`);

    window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    window.webContents.setWindowOpenHandler(({url})=>{
      try{
        const target=new URL(url);
        if(target.protocol==='https:')shell.openExternal(url);
        else if(target.protocol==='kotoba:'&&target.host==='app'&&/^\/dictionary\/[A-Z-]+\.md$/.test(target.pathname))return {action:'allow',overrideBrowserWindowOptions:{width:820,height:700,autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};
      }catch{}
      return {action:'deny'};
    });
    window.webContents.on('will-navigate',(event,url)=>{
      if(!url.startsWith('kotoba://app/')){
        event.preventDefault();
        try{if(new URL(url).protocol==='https:')shell.openExternal(url);}catch{}
      }
    });
    window.webContents.on('dom-ready', () => {
      startupMetrics.domReady = Date.now();
      console.log(`[STARTUP] dom-ready in ${startupMetrics.domReady - tProcessStart}ms`);
    });
    window.webContents.on('did-finish-load', () => {
      startupMetrics.didFinishLoad = Date.now();
      console.log(`[STARTUP] did-finish-load in ${startupMetrics.didFinishLoad - tProcessStart}ms`);
    });
    window.webContents.on('did-fail-load',(_event,code,description)=>{
      if(code!==-3)dialog.showErrorBox('KotoBud 加载失败',description);
    });
    window.loadURL('kotoba://app/');
  });
  app.on('window-all-closed',()=>app.quit());
}
