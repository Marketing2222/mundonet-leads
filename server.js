import express from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
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
const db = await open({ filename: DB_PATH, driver: sqlite3.Database });

await db.exec(`
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
  theme TEXT
);
`);

// default admin
const adminExists = await db.get('SELECT 1 FROM users WHERE username = ?', ['admin']);
if (!adminExists) {
  await db.run('INSERT INTO users (id, username, password, display_name) VALUES (?,?,?,?)',
    ['u1', 'admin', hashPass('mundonet@2026'), 'Administrador']);
}

// default columns
const colCount = await db.get('SELECT COUNT(*) as c FROM columns');
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
  for (const [id,name,color,order] of defaults) {
    await db.run('INSERT INTO columns (id,name,color,"order") VALUES (?,?,?,?)', [id,name,color,order]);
  }
}

function hashPass(p) { return crypto.createHash('sha256').update(p).digest('hex'); }
function uuid() { return crypto.randomUUID(); }

// ---------- AUTH ----------
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const row = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!row || row.password !== hashPass(password)) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name });
});

app.post('/api/switch-user', async (req, res) => {
  const { username, password } = req.body;
  const row = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!row || row.password !== hashPass(password)) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name });
});

// ---------- USERS ----------
app.get('/api/users', async (req, res) => {
  const rows = await db.all('SELECT id, username, display_name FROM users');
  res.json(rows);
});
app.post('/api/users', async (req, res) => {
  const { display_name, username, password } = req.body;
  if (!display_name || !username || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
  try {
    const id = uuid();
    await db.run('INSERT INTO users (id, username, password, display_name) VALUES (?,?,?,?)', [id, username, hashPass(password), display_name]);
    res.json({ id, username, display_name });
  } catch { res.status(400).json({ error: 'Usuário já existe' }); }
});
app.put('/api/users/:id', async (req, res) => {
  const { display_name, username, password } = req.body;
  if (!display_name || !username) return res.status(400).json({ error: 'Nome e login obrigatórios' });
  if (password) {
    await db.run('UPDATE users SET display_name=?, username=?, password=? WHERE id=?', [display_name, username, hashPass(password), req.params.id]);
  } else {
    await db.run('UPDATE users SET display_name=?, username=? WHERE id=?', [display_name, username, req.params.id]);
  }
  res.json({ ok: true });
});
app.delete('/api/users/:id', async (req, res) => {
  await db.run('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- COLUMNS ----------
app.get('/api/columns', async (req, res) => {
  const rows = await db.all('SELECT * FROM columns ORDER BY "order"');
  res.json(rows);
});
app.post('/api/columns', async (req, res) => {
  const { name, color } = req.body;
  const id = name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').substring(0,30) + '_' + Date.now().toString(36);
  const row = await db.get('SELECT MAX("order") as m FROM columns');
  const order = (row?.m || 0) + 1;
  await db.run('INSERT INTO columns (id,name,color,"order") VALUES (?,?,?,?)', [id,name,color,order]);
  res.json({ id, name, color, order });
});
app.put('/api/columns/:id', async (req, res) => {
  const { name, color, order } = req.body;
  await db.run('UPDATE columns SET name=COALESCE(?,name), color=COALESCE(?,color), "order"=COALESCE(?,order) WHERE id=?', [name, color, order, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/columns/:id', async (req, res) => {
  await db.run('DELETE FROM columns WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- LEADS ----------
app.get('/api/leads', async (req, res) => {
  const rows = await db.all('SELECT * FROM leads');
  rows.forEach(r => { try { r.historico = JSON.parse(r.historico || '[]'); } catch {} });
  res.json(rows);
});
app.post('/api/leads', async (req, res) => {
  const l = req.body;
  const now = new Date().toISOString();
  const mesRef = l.mes_referencia || now.substring(0,7);
  const id = l.id || uuid();
  const hist = l.historico ? JSON.stringify(l.historico) : '[]';
  await db.run(`INSERT INTO leads (id, column_id, etapa, cliente_nome, cliente_pix, lead_nome, lead_whatsapp, comentarios, data_convite, mes_referencia, historico, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [id, l.column_id, l.etapa, l.cliente_nome, l.cliente_pix, l.lead_nome, l.lead_whatsapp, l.comentarios, l.data_convite, mesRef, hist, now]);
  res.json({ id });
});
app.put('/api/leads/:id', async (req, res) => {
  const l = req.body;
  const hist = l.historico ? JSON.stringify(l.historico) : '[]';
  await db.run(`UPDATE leads SET column_id=?, etapa=?, cliente_nome=?, cliente_pix=?, lead_nome=?, lead_whatsapp=?, comentarios=?, data_convite=?, mes_referencia=?, historico=? WHERE id=?`,
    [l.column_id, l.etapa, l.cliente_nome, l.cliente_pix, l.lead_nome, l.lead_whatsapp, l.comentarios, l.data_convite, l.mes_referencia, hist, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/leads/:id', async (req, res) => {
  await db.run('DELETE FROM leads WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- CLIENTS ----------
app.get('/api/clients', async (req, res) => {
  const rows = await db.all('SELECT * FROM clients ORDER BY nome');
  res.json(rows);
});
app.post('/api/clients', async (req, res) => {
  const c = req.body;
  const id = c.id || uuid();
  await db.run('INSERT INTO clients (id, nome, whatsapp, link_indicacao, editado) VALUES (?,?,?,?,?)', [id, c.nome, c.whatsapp, c.link_indicacao, c.editado ? 1 : 0]);
  res.json({ id });
});
app.put('/api/clients/:id', async (req, res) => {
  const c = req.body;
  await db.run('UPDATE clients SET nome=?, whatsapp=?, link_indicacao=?, editado=? WHERE id=?', [c.nome, c.whatsapp, c.link_indicacao, c.editado ? 1 : 0, req.params.id]);
  res.json({ ok: true });
});
app.delete('/api/clients/:id', async (req, res) => {
  await db.run('DELETE FROM clients WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});
app.post('/api/clients/sync', async (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients)) return res.status(400).json({ error: 'Array de clientes esperado' });
  await db.run('DELETE FROM clients');
  for (const c of clients) {
    await db.run('INSERT INTO clients (id,nome,whatsapp,link_indicacao,editado) VALUES (?,?,?,?,?)', [c.id, c.nome, c.whatsapp || '', c.link_indicacao || '', c.editado ? 1 : 0]);
  }
  res.json({ ok: true, count: clients.length });
});

// ---------- API CONFIG ----------
app.get('/api/config', async (req, res) => {
  const row = await db.get('SELECT * FROM api_config WHERE id=1');
  res.json(row || {});
});
app.put('/api/config', async (req, res) => {
  const { ixc_url, ixc_token, zapisp_url, zapisp_token } = req.body;
  await db.run('INSERT OR REPLACE INTO api_config (id, ixc_url, ixc_token, zapisp_url, zapisp_token) VALUES (1,?,?,?,?)', [ixc_url, ixc_token, zapisp_url, zapisp_token]);
  res.json({ ok: true });
});

// ---------- PREFS ----------
app.get('/api/prefs', async (req, res) => {
  const row = await db.get('SELECT * FROM prefs WHERE id=1');
  res.json(row || {});
});
app.put('/api/prefs', async (req, res) => {
  const { nome, sub, logo, theme } = req.body;
  await db.run('INSERT OR REPLACE INTO prefs (id, nome, sub, logo, theme) VALUES (1,?,?,?,?)', [nome, sub, logo, theme]);
  res.json({ ok: true });
});

// ---------- SPA fallback ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));