const net = require('node:net');
function endpoint(input = {}) {
  let address=String(input.address || '').trim();
  if(address.startsWith('[') && address.endsWith(']'))address=address.slice(1,-1);
  const username=String(input.username || '').trim(), text=String(input.port ?? '').trim();
  const port=text===''?22:Number(text);
  if(!address || address.length>253 || (!net.isIP(address) && !/^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(address)))throw Error('请输入有效的 IP 地址或主机名，不要包含用户名或端口');
  if(!/^\d+$/.test(text || '22') || !Number.isInteger(port) || port<1 || port>65535)throw Error('端口应为 1–65535，留空使用 22');
  if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}\$?$/.test(username))throw Error('请输入有效的 SSH 用户名');
  return {address,port,username};
}
const title=p=>`${p.username}@${p.address.includes(':')?'['+p.address+']':p.address}:${p.port}`;
const sameEndpoint=(a,b)=>a && a.address===b.address && a.port===b.port && a.username===b.username;
function savedConnection(input) {
  const p=endpoint(input);
  if(!/^[0-9a-f-]{36}$/i.test(input.credentialID || '') || !/^[0-9a-f]{64}$/i.test(input.fingerprint || ''))throw Error('密码连接配置无效，请恢复配置或删除该连接后重新添加');
  return {...p,credentialID:input.credentialID,fingerprint:input.fingerprint,remember:input.remember===true};
}
function validatePassword(password) {
  if(typeof password!=='string' || !password.length || Buffer.byteLength(password)>16384 || /[\r\n\0]/.test(password))throw Error('请输入有效的非空密码（不含换行）');
}
module.exports={endpoint,title,sameEndpoint,savedConnection,validatePassword};
