import express from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const PORT = process.env.PORT || 3737;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'mundonet.db');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ---------- DB ----------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  "order" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  column_id TEXT NOT NULL,
  etapa TEXT NOT NULL,
  cliente_nome TEXT,
  cliente_pix TEXT,
  lead_nome TEXT NOT NULL,
  lead_whatsapp TEXT,
  comentarios TEXT,
  data_convite TEXT,
  mes_referencia TEXT,
  historico TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  whatsapp TEXT,
  link_indicacao TEXT,
  editado INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS api_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ixc_url TEXT,
  ixc_token TEXT,
  zapisp_url TEXT,
  zapisp_token TEXT
);
CREATE TABLE IF NOT EXISTS prefs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nome TEXT,
  sub TEXT,
  logo TEXT,
  theme TEXT,
  templates TEXT
);
`);

try { db.exec(`ALTER TABLE prefs ADD COLUMN templates TEXT`); } catch(e) {}

// default admin
const adminExists = db.prepare('SELECT 1 FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?,?,?,?)').run('u1', 'admin', hashPass('mundonet@2026'), 'Administrador');
}

// default columns
const colCount = db.prepare('SELECT COUNT(*) as c FROM columns').get();
if (colCount.c === 0) {
  const defaults = [
    ['pendentes','Pendentes','#3b82f6',0],
    ['em-atend','Em atendimento','#f59e0b',1],
    ['ag-assina','Aguardando Assinatura','#f97316',2],
    ['agendado','Agendado','#10b981',3],
    ['reagendar','Reagendar','#8b5cf6',4],
    ['como-comis','Como receber a comissão','#06b6d4',5],
    ['at-comis','Em atendimento comissão','#eab308',6],
    ['nr-comis','Não respondeu à comissão','#6b7280',7],
    ['invalida','Indicação inválida','#ef4444',8],
    ['sem-viab','Sem viabilidade','#4b5563',9],
    ['sondagem','Sondagem','#60a5fa',10],
    ['nao-resp','Lead que não respondeu','#9ca3af',11],
    ['ganho','Ganho','#059669',12],
    ['perdido','Perdido','#dc2626',13],
  ];
  const stmt = db.prepare('INSERT INTO columns (id,name,color,"order") VALUES (?,?,?,?)');
  for (const [id,name,color,order] of defaults) {
    stmt.run(id,name,color,order);
  }
}

function hashPass(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
function uuid() { return crypto.randomUUID(); }

// ---------- AUTH ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || row.password !== hashPass(password)) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name });
});

app.post('/api/switch-user', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || row.password !== hashPass(password)) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name });
});

// ---------- USERS ----------
app.get('/api/users', (req, res) => {
  const rows = db.prepare('SELECT id, username, display_name FROM users').all();
  res.json(rows);
});
app.post('/api/users', (req, res) => {
  const { display_name, username, password } = req.body;
  if (!display_name || !username || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
  try {
    const id = uuid();
    db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?,?,?,?)').run(id, username, hashPass(password), display_name);
    res.json({ id, username, display_name });
  } catch { res.status(400).json({ error: 'Usuário já existe' }); }
});
app.put('/api/users/:id', (req, res) => {
  const { display_name, username, password } = req.body;
  if (!display_name || !username) return res.status(400).json({ error: 'Nome e login obrigatórios' });
  if (password) {
    db.prepare('UPDATE users SET display_name=?, username=?, password=? WHERE id=?').run(display_name, username, hashPass(password), req.params.id);
  } else {
    db.prepare('UPDATE users SET display_name=?, username=? WHERE id=?').run(display_name, username, req.params.id);
  }
  res.json({ ok: true });
});
app.delete('/api/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- COLUMNS ----------
app.get('/api/columns', (req, res) => {
  const rows = db.prepare('SELECT * FROM columns ORDER BY "order"').all();
  res.json(rows);
});
app.post('/api/columns', (req, res) => {
  const { name, color } = req.body;
  const id = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').substring(0,30) + '_' + Date.now().toString(36);
  const row = db.prepare('SELECT MAX("order") as m FROM columns').get();
  const order = (row?.m || 0) + 1;
  db.prepare('INSERT INTO columns (id,name,color,"order") VALUES (?,?,?,?)').run(id,name,color,order);
  res.json({ id, name, color, order });
});
app.put('/api/columns/:id', (req, res) => {
  const { name, color, order } = req.body;
  db.prepare('UPDATE columns SET name=COALESCE(?,name), color=COALESCE(?,color), "order"=COALESCE(?,order) WHERE id=?').run(name, color, order, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/columns/:id', (req, res) => {
  db.prepare('DELETE FROM columns WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- LEADS ----------
app.get('/api/leads', (req, res) => {
  const rows = db.prepare('SELECT * FROM leads').all();
  rows.forEach(r => { try { r.historico = JSON.parse(r.historico || '[]'); } catch(e) {} });
  res.json(rows);
});
app.post('/api/leads', (req, res) => {
  const l = req.body;
  const now = new Date().toISOString();
  const mesRef = l.mes_referencia || now.substring(0,7);
  const id = l.id || uuid();
  const hist = l.historico ? JSON.stringify(l.historico) : '[]';
  db.prepare(`INSERT INTO leads (id, column_id, etapa, cliente_nome, cliente_pix, lead_nome, lead_whatsapp, comentarios, data_convite, mes_referencia, historico, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, l.column_id, l.etapa, l.cliente_nome, l.cliente_pix, l.lead_nome, l.lead_whatsapp, l.comentarios, l.data_convite, mesRef, hist, now);
  res.json({ id });
});
app.put('/api/leads/:id', (req, res) => {
  const l = req.body;
  const hist = l.historico ? JSON.stringify(l.historico) : '[]';
  db.prepare(`UPDATE leads SET column_id=?, etapa=?, cliente_nome=?, cliente_pix=?, lead_nome=?, lead_whatsapp=?, comentarios=?, data_convite=?, mes_referencia=?, historico=? WHERE id=?`)
    .run(l.column_id, l.etapa, l.cliente_nome, l.cliente_pix, l.lead_nome, l.lead_whatsapp, l.comentarios, l.data_convite, l.mes_referencia, hist, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/leads/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- CLIENTS ----------
app.get('/api/clients', (req, res) => {
  const rows = db.prepare('SELECT * FROM clients ORDER BY nome').all();
  res.json(rows);
});
app.post('/api/clients', (req, res) => {
  const c = req.body;
  const id = c.id || uuid();
  db.prepare('INSERT INTO clients (id, nome, whatsapp, link_indicacao, editado) VALUES (?,?,?,?,?)').run(id, c.nome, c.whatsapp, c.link_indicacao, c.editado ? 1 : 0);
  res.json({ id });
});
app.put('/api/clients/:id', (req, res) => {
  const c = req.body;
  db.prepare('UPDATE clients SET nome=?, whatsapp=?, link_indicacao=?, editado=? WHERE id=?').run(c.nome, c.whatsapp, c.link_indicacao, c.editado ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete('/api/clients/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
app.post('/api/clients/sync', (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients)) return res.status(400).json({ error: 'Array de clientes esperado' });
  const del = db.prepare('DELETE FROM clients');
  const ins = db.prepare('INSERT INTO clients (id,nome,whatsapp,link_indicacao,editado) VALUES (?,?,?,?,?)');
  const tx = db.transaction(() => {
    del.run();
    for (const c of clients) {
      ins.run(c.id, c.nome, c.whatsapp || '', c.link_indicacao || '', c.editado ? 1 : 0);
    }
  });
  tx();
  res.json({ ok: true, count: clients.length });
});

// ---------- API CONFIG ----------
app.get('/api/config', (req, res) => {
  const row = db.prepare('SELECT * FROM api_config WHERE id=1').get();
  res.json(row || {});
});
app.put('/api/config', (req, res) => {
  const { ixc_url, ixc_token, zapisp_url, zapisp_token } = req.body;
  db.prepare('INSERT OR REPLACE INTO api_config (id, ixc_url, ixc_token, zapisp_url, zapisp_token) VALUES (1,?,?,?,?)').run(ixc_url, ixc_token, zapisp_url, zapisp_token);
  res.json({ ok: true });
});

// ---------- PREFS ----------
app.get('/api/prefs', (req, res) => {
  const row = db.prepare('SELECT * FROM prefs WHERE id=1').get();
  if (row && row.templates) {
    try { row.templates = JSON.parse(row.templates); } catch(e) { row.templates = []; }
  }
  res.json(row || {});
});
app.put('/api/prefs', (req, res) => {
  try {
    const { nome, sub, logo, theme, templates } = req.body;
    const tpl = templates ? JSON.stringify(templates) : '[]';
    db.prepare('INSERT OR REPLACE INTO prefs (id, nome, sub, logo, theme, templates) VALUES (1,?,?,?,?,?)').run(nome||'', sub||'', logo||'', theme||'', tpl);
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/prefs error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------- SPA fallback ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
