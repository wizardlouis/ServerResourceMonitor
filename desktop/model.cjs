const crypto = require('node:crypto');
const sizes = [1, 2, 4, 8, 16];
const validAlias = alias => typeof alias === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(alias);
const column = (name, members) => ({id: crypto.randomUUID(), name, members});
function normalize(input = {}) {
  if (!Array.isArray(input.servers)) throw Error('服务器配置格式无效');
  const servers = [...new Set(input.servers.filter(validAlias))];
  if (servers.length > 16) throw Error('最多支持 16 台服务器');
  const seen = new Set(), ids = new Set(), columns = [];
  for (const c of input.columns || []) {
    if (!c || !Array.isArray(c.members)) continue;
    const members = c.members.filter(a => servers.includes(a) && !seen.has(a) && seen.add(a));
    if (!members.length) continue;
    const id = typeof c.id === 'string' && !ids.has(c.id) ? c.id : crypto.randomUUID();
    ids.add(id);
    columns.push({id, name: String(c.name || members.join(' + ')).trim().slice(0, 80), members});
  }
  for (const alias of servers) if (!seen.has(alias)) columns.push(column(alias, [alias]));
  const coreGrouping = Object.fromEntries(servers.map(a => [a, sizes.includes(input.coreGrouping?.[a]) ? input.coreGrouping[a] : 1]));
  return {version: 1, servers, columns, coreGrouping, overviewCollapsed: input.overviewCollapsed === true};
}
function mutate(config, action) {
  const c = structuredClone(config);
  const a = action || {};
  switch (a.type) {
    case 'add': {
      const alias = String(a.alias || '').trim();
      if (!validAlias(alias)) throw Error('请输入有效的 SSH Host 别名');
      if (c.servers.includes(alias)) throw Error('该服务器已在列表中');
      if (c.servers.length >= 16) throw Error('最多支持 16 台服务器');
      c.servers.push(alias); break;
    }
    case 'remove': c.servers = c.servers.filter(s => s !== a.alias); break;
    case 'move': {
      const i = c.columns.findIndex(x => x.id === a.id);
      if (![1, -1].includes(a.step)) throw Error('无效移动方向');
      if (i >= 0 && c.columns[i + a.step]) [c.columns[i], c.columns[i + a.step]] = [c.columns[i + a.step], c.columns[i]];
      break;
    }
    case 'edit': {
      const name = String(a.name || '').trim();
      const members = [...new Set(Array.isArray(a.members) ? a.members : [])];
      if (!name || name.length > 80) throw Error('组名需为 1–80 个字符');
      if (!members.length || members.some(s => !c.servers.includes(s))) throw Error('请至少选择一台有效服务器');
      const index = a.id ? c.columns.findIndex(x => x.id === a.id) : c.columns.length;
      if (index < 0) throw Error('分组已不存在');
      const old = a.id ? c.columns[index].members : [];
      c.columns = c.columns.filter(x => x.id !== a.id).map(x => ({...x, members: x.members.filter(m => !members.includes(m))}));
      c.columns.splice(Math.min(index, c.columns.length), 0, {id: a.id || crypto.randomUUID(), name, members}, ...old.filter(m => !members.includes(m)).map(m => column(m, [m])));
      break;
    }
    case 'dissolve': {
      const i = c.columns.findIndex(x => x.id === a.id);
      if (i >= 0) c.columns.splice(i, 1, ...c.columns[i].members.map(m => column(m, [m])));
      break;
    }
    case 'coreSize':
      if (!c.servers.includes(a.alias) || !sizes.includes(a.size)) throw Error('无效核心显示粒度');
      c.coreGrouping[a.alias] = a.size; break;
    case 'overview': c.overviewCollapsed = !!a.collapsed; break;
    default: throw Error('未知配置操作');
  }
  return normalize(c);
}
module.exports = {normalize, mutate, validAlias};
