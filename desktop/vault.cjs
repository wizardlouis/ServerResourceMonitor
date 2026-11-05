const fs=require('node:fs'),path=require('node:path');
const {validatePassword}=require('./connections.cjs');
class Vault {
  constructor(filename,safeStorage,platform=process.platform) {
    this.filename=filename;this.crypto=safeStorage;this.platform=platform;this.session=new Map();this.disk={};this.error=null;
    try { if(fs.existsSync(filename)) {
      const data=JSON.parse(fs.readFileSync(filename,'utf8'));
      if(!data || Array.isArray(data) || typeof data!=='object' || Object.values(data).some(v=>typeof v!=='string'))throw Error();
      this.disk=data;
    }}catch{this.error='密码存储文件无法读取，原文件已保留';}
  }
  canRemember() {
    try { return this.crypto.isEncryptionAvailable() && (this.platform!=='linux' || ['gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(this.crypto.getSelectedStorageBackend())); }
    catch{return false;}
  }
  write(next) {
    if(this.error)throw Error(this.error);
    fs.mkdirSync(path.dirname(this.filename),{recursive:true});
    const temp=this.filename+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(next),{mode:0o600});fs.renameSync(temp,this.filename);this.disk=next;
  }
  put(id,password,remember) {
    validatePassword(password);
    if(remember) {
      if(!this.canRemember())throw Error('系统安全存储不可用，请取消“记住密码”，仅在本次运行中连接');
      const encrypted=this.crypto.encryptString(password).toString('base64');
      this.write({...this.disk,[id]:encrypted});
    } else this.session.set(id,password);
  }
  get(id) {
    if(this.session.has(id))return this.session.get(id);
    if(this.disk[id] && this.canRemember()) {
      try {return this.crypto.decryptString(Buffer.from(this.disk[id],'base64'));}catch{}
    }
    throw Object.assign(Error('密码未保存或安全存储无法解锁，请打开连接设置重新输入密码'),{code:'CREDENTIAL'});
  }
  remove(id) {
    this.session.delete(id);
    if(Object.hasOwn(this.disk,id)){const next={...this.disk};delete next[id];this.write(next);}
  }
  clearSession(){this.session.clear();}
}
module.exports={Vault};
