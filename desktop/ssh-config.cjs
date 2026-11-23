const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {createHash, randomUUID} = require('node:crypto');
const {sshExecutable} = require('./collector.cjs');
const {endpoint} = require('./connections.cjs');
const configPath = () => path.join(os.homedir(), '.ssh', 'config');
const digest = text => createHash('sha256').update(text).digest('hex');
function validateAlias(alias) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(alias)) throw Error('SSH 别名无效');
}
function read(alias) {
  validateAlias(alias);
  const text = fs.readFileSync(configPath(), 'utf8');
  const resolved = execFileSync(sshExecutable(), ['-G', alias], {encoding:'utf8', timeout:5000, stdio:['ignore','pipe','ignore']});
  const fields = Object.fromEntries(resolved.split('\n').map(line => line.split(/ (.*)/s).slice(0,2)));
  return {alias, address:fields.hostname, username:fields.user, port:Number(fields.port), revision:digest(text)};
}
function writeAtomic(file, text, mode) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, text, {mode, flag:'wx'}); fs.renameSync(temp,file); }
  finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function save(input) {
  validateAlias(input.alias);
  const value = endpoint(input), file = configPath(), stat = fs.lstatSync(file);
  if (!stat.isFile()) throw Error('SSH 配置是符号链接或特殊文件，请先在终端处理');
  const original = fs.readFileSync(file,'utf8');
  if (digest(original) !== input.revision) throw Error('SSH 配置已被其他程序修改，请关闭并重新打开此窗口');
  const start = `# ServerResourceMonitor ${input.alias} begin`, end = `# ServerResourceMonitor ${input.alias} end`;
  let body = original;
  const from = body.indexOf(start+'\n');
  if(from >= 0) {
    const to = body.indexOf(end+'\n',from);
    if(to < 0) throw Error('监控器配置块不完整，请在终端检查');
    body = body.slice(0,from)+body.slice(to+end.length+1);
  }
  // OpenSSH uses the first value, so this exact Host override preserves shared and Include settings.
  const updated = `${start}\nHost ${input.alias}\n    HostName ${value.address}\n    User ${value.username}\n    Port ${value.port}\n${end}\nHost *\n` + body;
  const backup = file + '.monitor-backup-' + Date.now();
  fs.writeFileSync(backup,original,{mode:0o600,flag:'wx'});
  writeAtomic(file,updated,stat.mode & 0o777);
  return {backup, revision:digest(updated)};
}
function restore(input) {
  const file = configPath();
  if (path.dirname(input.backup) !== path.dirname(file) || !path.basename(input.backup).startsWith('config.monitor-backup-')) throw Error('备份路径无效');
  if(digest(fs.readFileSync(file,'utf8')) !== input.revision) throw Error('配置已再次修改，无法自动恢复，请手动检查备份');
  writeAtomic(file,fs.readFileSync(input.backup,'utf8'),0o600);
}
module.exports = {read,save,restore};
