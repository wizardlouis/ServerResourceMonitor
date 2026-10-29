const {spawn} = require('node:child_process');
const path = require('node:path');
const {validAlias} = require('./model.cjs');
const sshExecutable = () => process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe') : '/usr/bin/ssh';
function collect(alias, script, {spawnImpl = spawn, timeout = 18000} = {}) {
  if (!validAlias(alias)) throw Error('无效 SSH 别名');
  let child;
  const promise = new Promise((resolve, reject) => {
    child = spawnImpl(sshExecutable(), ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=1', alias, 'python3 -'], {windowsHide: true, shell: false});
    let stdout = '', stderr = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { finish(Error('SSH 采集超时，请检查网络或 VPN')); child.kill(); }, timeout);
    child.on('error', e => finish(Error(e.code === 'ENOENT' ? '找不到 OpenSSH 客户端，请安装系统 OpenSSH 客户端' : e.message)));
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 4 * 1024 * 1024) { finish(Error('采集数据过大')); child.kill(); }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.on('close', code => {
      if (code !== 0) return finish(Error(stderr.trim().slice(0, 600) || 'SSH 连接失败'));
      try {
        const data = JSON.parse(stdout);
        if (!Array.isArray(data.gpus) || !Array.isArray(data.processes) || !Number.isFinite(data.cpu_percent)) throw Error('无效指标');
        finish(null, data);
      } catch { finish(Error('服务器返回的数据格式无效；需要 Linux 和 Python 3')); }
    });
    child.stdin.end(script);
  });
  return {promise, cancel: () => child?.kill()};
}
module.exports = {collect, sshExecutable};
