const fs = require('node:fs');
const path = require('node:path');
const {normalize, mutate} = require('./model.cjs');
class Store {
  constructor(filename, legacy) {
    this.filename = filename;
    this.error = ''; this.imported = false;
    this.config = normalize({servers: []});
    try {
      if (fs.existsSync(filename)) this.config = normalize(JSON.parse(fs.readFileSync(filename, 'utf8')));
      else if (legacy && fs.existsSync(legacy)) {
        const next = normalize(JSON.parse(fs.readFileSync(legacy, 'utf8')));
        this.save(next); this.imported = true;
      }
    } catch (e) { this.error = `配置未载入，原文件已保留：${e.message}`; }
  }
  save(next) {
    fs.mkdirSync(path.dirname(this.filename), {recursive: true});
    const tmp = this.filename + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), {mode: 0o600});
    fs.renameSync(tmp, this.filename);
    this.config = next;
  }
  update(action) {
    if (this.error) throw Error(this.error + '；请先修复配置文件再重启');
    this.save(mutate(this.config, action));
    return this.config;
  }
}
module.exports = {Store};
