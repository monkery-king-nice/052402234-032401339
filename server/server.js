'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const M = require('../js/model');
const seed = require('../js/seed');
const root = path.resolve(__dirname, '..');
const hash = value => createHash('sha256').update(value).digest('hex');
function createService({ dbPath = path.join(__dirname, 'data', 'campus.sqlite'), origins = ['null'], seedItems = seed } = {}) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sessions (owner TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, owner TEXT NOT NULL, legacy_key TEXT, data TEXT NOT NULL, UNIQUE(owner,legacy_key));
    CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      owner TEXT NOT NULL, request_id TEXT NOT NULL, nickname TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner,request_id));`);
  // INSERT OR IGNORE preserves existing shared records and comment IDs across restart.
  for (const item of seedItems) db.prepare('INSERT OR IGNORE INTO items(id,owner,data) VALUES(?,?,?)').run(item.id, 'demo', JSON.stringify(item));
  const limits = new Map();
  function rate(key, max) {
    const now = Date.now();
    const current = limits.get(key);
    if (!current || current.until < now) limits.set(key, { count: 1, until: now + 60000 });
    else if (++current.count > max) fail(429, '操作太频繁，请稍后再试');
    if (limits.size > 5000) for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  }
  function fail(status, message, fields) { throw Object.assign(new Error(message), { status, fields }); }
  function owner(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const session = token && db.prepare('SELECT owner FROM sessions WHERE token_hash=?').get(hash(token));
    if (!session) fail(401, '匿名身份已失效，请重新连接服务');
    return session.owner;
  }
  function getItem(id) {
    const row = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    if (!row) fail(404, '启事不存在或已被删除');
    return row;
  }
  async function body(req) {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) fail(413, '内容过大，请减少照片后重试');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    try { const value = JSON.parse(raw); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; }
    catch (_) { fail(400, '请求格式不正确'); }
  }
  const server = http.createServer(async (req, res) => {
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      const origin = req.headers.origin;
      const sameOrigin = origin === 'http://' + req.headers.host || origin === 'https://' + req.headers.host;
      if (origin && (sameOrigin || origins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      } else if (origin && url.pathname.startsWith('/api/')) fail(403, '此网页来源未被服务允许');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (url.pathname === '/api/session' && req.method === 'POST') {
        // Rate limit anonymous account issuance separately; never trust client ownerId.
        rate('session:' + req.socket.remoteAddress, 10);
        if (req.headers.authorization) { const id = owner(req); json(200, { ownerId: id }); return; }
        const token = randomBytes(32).toString('hex'), id = randomUUID();
        db.prepare('INSERT INTO sessions VALUES(?,?)').run(id, hash(token));
        json(201, { token, ownerId: id }); return;
      }
      if (url.pathname === '/api/items' && req.method === 'GET') {
        json(200, db.prepare('SELECT data FROM items ORDER BY rowid DESC').all().map(row => JSON.parse(row.data))); return;
      }
      if (url.pathname === '/api/items' && req.method === 'POST') {
        const id = owner(req); rate('write:' + id, 30);
        const draft = await body(req);
        const errors = M.validateDraft(draft);
        if (Object.keys(errors).length) fail(400, '请检查启事内容', errors);
        const legacyKey = M.clean(draft.legacyKey).slice(0, 160) || null;
        if (legacyKey) {
          const existing = db.prepare('SELECT data FROM items WHERE owner=? AND legacy_key=?').get(id, legacyKey);
          if (existing) { json(200, JSON.parse(existing.data)); return; }
        }
        const item = M.createItem(draft, id, new Date(), randomUUID());
        if (legacyKey && draft.status === 'resolved') item.status = 'resolved';
        db.prepare('INSERT INTO items VALUES(?,?,?,?)').run(item.id, id, legacyKey, JSON.stringify(item));
        json(201, item); return;
      }
      const match = /^\/api\/items\/([^/]+)(\/comments)?$/.exec(url.pathname);
      if (match) {
        const itemId = decodeURIComponent(match[1]);
        const row = getItem(itemId);
        if (match[2] && req.method === 'GET') {
          json(200, db.prepare('SELECT id,item_id AS itemId,nickname,body,created_at AS createdAt FROM comments WHERE item_id=? ORDER BY created_at ASC,rowid ASC').all(itemId)); return;
        }
        if (match[2] && req.method === 'POST') {
          const id = owner(req); rate('comment:' + id, 20);
          const draft = await body(req), errors = M.validateComment(draft);
          if (Object.keys(errors).length) fail(400, '请检查昵称和评论', errors);
          if (!/^[a-zA-Z0-9-]{8,80}$/.test(draft.requestId || '')) fail(400, '缺少有效的提交标识');
          const previous = db.prepare('SELECT * FROM comments WHERE owner=? AND request_id=?').get(id, draft.requestId);
          if (previous && (previous.item_id !== itemId || previous.nickname !== M.clean(draft.nickname) || previous.body !== M.clean(draft.body))) fail(409, '提交标识冲突，请重新提交');
          if (!previous) db.prepare('INSERT INTO comments VALUES(?,?,?,?,?,?,?)').run(randomUUID(), itemId, id, draft.requestId, M.clean(draft.nickname), M.clean(draft.body), new Date().toISOString());
          json(previous ? 200 : 201, { ok: true }); return;
        }
        if (!match[2] && ['PATCH','DELETE'].includes(req.method)) {
          const id = owner(req); rate('write:' + id, 30);
          if (row.owner !== id || row.owner === 'demo') fail(403, '只有发布者可以修改或删除启事');
          if (req.method === 'DELETE') { db.prepare('DELETE FROM items WHERE id=?').run(itemId); json(200, { ok: true }); return; }
          const draft = await body(req);
          if (!['active','resolved'].includes(draft.status)) fail(400, '无效状态');
          const item = { ...JSON.parse(row.data), status: draft.status };
          db.prepare('UPDATE items SET data=? WHERE id=?').run(JSON.stringify(item), itemId);
          json(200, item); return;
        }
      }
      if (url.pathname.startsWith('/api/')) fail(404, '接口不存在');
      // Explicit static whitelist keeps tokens, database, tests and private configs off the web.
      const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).slice(1);
      if (req.method !== 'GET' || rel.split('/').some(part => part === '..' || part === '.') || !/^(index\.html|(?:js|css|assets)\/[\w./-]+)$/.test(rel)) fail(404, '页面不存在');
      const file = path.resolve(root, rel);
      if (!file.startsWith(root + path.sep)) fail(404, '页面不存在');
      const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
      const data = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': (mime[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control':'no-cache' }); res.end(data);
    } catch (error) { json(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : '服务暂时无法完成操作，请稍后重试', fields: error.fields }); }
  });
  server.requestTimeout = 15000;
  return { server, db, close: () => new Promise(resolve => { server.close(() => { db.close(); resolve(); }); server.closeAllConnections(); }) };
}
if (require.main === module) {
  const service = createService({ dbPath: process.env.DATA_FILE || path.join(__dirname, 'data', 'campus.sqlite'), origins: (process.env.ALLOWED_ORIGINS || 'null').split(',') });
  service.server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('校园拾光共享服务已启动：端口 ' + service.server.address().port));
}
module.exports = { createService };
