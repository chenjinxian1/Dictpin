'use strict';
function desktopChrome(platform,appearance='light',systemDark=false){
 if(platform!=='win32')return {};
 const dark=appearance==='dark'||(appearance==='system'&&systemDark);
 return {titleBarStyle:'hidden',titleBarOverlay:{height:40,color:dark?'#202124':'#f5f6f7',symbolColor:dark?'#edf0f3':'#252a32'}};
}
function updateDesktopChrome(win,platform,appearance,systemDark){const options=desktopChrome(platform,appearance,systemDark);if(options.titleBarOverlay&&!win?.isDestroyed?.())win?.setTitleBarOverlay?.(options.titleBarOverlay);}
module.exports={desktopChrome,updateDesktopChrome};
