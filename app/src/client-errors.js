'use strict';
function errorForClient(error){
  // Filesystem/system errors can contain full local paths. Keep useful field
  // validation and sanitized API errors, but never forward these raw objects.
  if(error&&typeof error.code==='string'&&/^E[A-Z0-9_]+$/.test(error.code))return new Error('本地读取、保存或清理失败，请检查磁盘空间和目录权限。');
  return new Error(typeof error?.message==='string'?error.message.slice(0,500):'操作未完成，请重试。');
}
module.exports={errorForClient};
