import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const PORT = process.env.PORT || 80;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DB_PATH || path.join(__dirname, 'data');
console.log('DATA_DIR:', DATA_DIR, '| DB_PATH env:', process.env.DB_PATH || '(not set)');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ---------- JSON file storage ----------
function readStore(name) {
  const f = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
function writeStore(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name + '.json'), JSON.stringify(data, null, 2));
}
function readObj(name) {
  const f = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
function writeObj(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name + '.json'), JSON.stringify(data, null, 2));
}

function uuid() { return crypto.randomUUID(); }
function hashPass(p) { return crypto.createHash('sha256').update(p).digest('hex'); }

// Ensure admin user exists
function ensureAdminUser() {
  const usersList = readStore('users');
  const adminPassHash = hashPass('123456');
  const existingAdmin = usersList.find(u => u.username.toLowerCase() === 'admin');
  if (existingAdmin) {
    existingAdmin.password = adminPassHash;
    writeStore('users', usersList);
  } else {
    usersList.push({ id: uuid(), username: 'admin', password: adminPassHash, display_name: 'Administrador' });
    writeStore('users', usersList);
  }
}
ensureAdminUser();

const columns = readStore('columns');
if (columns.length === 0) {
  const defaults = [
    { id:'pendentes', name:'Pendentes', color:'#3b82f6', order:0 },
    { id:'em-atend', name:'Em atendimento', color:'#f59e0b', order:1 },
    { id:'ag-assina', name:'Aguardando Assinatura', color:'#f97316', order:2 },
    { id:'agendado', name:'Agendado', color:'#10b981', order:3 },
    { id:'reagendar', name:'Reagendar', color:'#8b5cf6', order:4 },
    { id:'como-comis', name:'Como receber a comissão', color:'#06b6d4', order:5 },
    { id:'at-comis', name:'Em atendimento comissão', color:'#eab308', order:6 },
    { id:'nr-comis', name:'Não respondeu à comissão', color:'#6b7280', order:7 },
    { id:'invalida', name:'Indicação inválida', color:'#ef4444', order:8 },
    { id:'sem-viab', name:'Sem viabilidade', color:'#4b5563', order:9 },
    { id:'sondagem', name:'Sondagem', color:'#60a5fa', order:10 },
    { id:'nao-resp', name:'Lead que não respondeu', color:'#9ca3af', order:11 },
    { id:'ganho', name:'Ganho', color:'#059669', order:12 },
    { id:'perdido', name:'Perdido', color:'#dc2626', order:13 },
  ];
  writeStore('columns', defaults);
}

// ---------- AUTH ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(401).json({ error: 'Credenciais inválidas' });
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanPassword = String(password).trim();
  const usersList = readStore('users');
  const row = usersList.find(u => (u.username || '').trim().toLowerCase() === cleanUsername);
  if (!row || row.password !== hashPass(cleanPassword)) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name });
});
app.post('/api/switch-user', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(401).json({ error: 'Credenciais inválidas' });
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanPassword = String(password).trim();
  const usersList = readStore('users');
  const row = usersList.find(u => (u.username || '').trim().toLowerCase() === cleanUsername);
  if (!row || row.password !== hashPass(cleanPassword)) return res.status(401).json({ error: 'Credenciais inválidas' });
  res.json({ id: row.id, username: row.username, display_name: row.display_name });
});

// ---------- USERS ----------
app.get('/api/users', (req, res) => {
  res.json(readStore('users').map(u => ({ id:u.id, username:u.username, display_name:u.display_name })));
});
app.post('/api/users', (req, res) => {
  const { display_name, username, password } = req.body;
  if (!display_name || !username || !password) return res.status(400).json({ error: 'Campos obrigatórios' });
  const list = readStore('users');
  if (list.find(u => u.username === username)) return res.status(400).json({ error: 'Usuário já existe' });
  const u = { id: uuid(), username, password: hashPass(password), display_name };
  list.push(u); writeStore('users', list);
  res.json({ id: u.id, username: u.username, display_name: u.display_name });
});
app.put('/api/users/:id', (req, res) => {
  const { display_name, username, password } = req.body;
  if (!display_name || !username) return res.status(400).json({ error: 'Nome e login obrigatórios' });
  const list = readStore('users');
  const idx = list.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  list[idx].display_name = display_name;
  list[idx].username = username;
  if (password) list[idx].password = hashPass(password);
  writeStore('users', list);
  res.json({ ok: true });
});
app.delete('/api/users/:id', (req, res) => {
  let list = readStore('users');
  list = list.filter(u => u.id !== req.params.id);
  writeStore('users', list);
  res.json({ ok: true });
});

// ---------- COLUMNS ----------
app.get('/api/columns', (req, res) => {
  res.json(readStore('columns').sort((a,b) => a.order - b.order));
});
app.post('/api/columns', (req, res) => {
  const { name, color } = req.body;
  const list = readStore('columns');
  const maxOrder = list.reduce((m, c) => Math.max(m, c.order || 0), 0);
  const c = { id: name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').substring(0,30) + '_' + Date.now().toString(36), name, color, order: maxOrder + 1 };
  list.push(c); writeStore('columns', list);
  res.json(c);
});
app.put('/api/columns/:id', (req, res) => {
  const { name, color, order } = req.body;
  const list = readStore('columns');
  const idx = list.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  if (name !== undefined) list[idx].name = name;
  if (color !== undefined) list[idx].color = color;
  if (order !== undefined) list[idx].order = order;
  writeStore('columns', list);
  res.json({ ok: true });
});
app.delete('/api/columns/:id', (req, res) => {
  let list = readStore('columns');
  list = list.filter(c => c.id !== req.params.id);
  writeStore('columns', list);
  res.json({ ok: true });
});

// ---------- LEADS ----------
app.get('/api/leads', (req, res) => { res.json(readStore('leads')); });
app.post('/api/leads', (req, res) => {
  const l = req.body;
  const now = new Date().toISOString();
  const lead = { id: l.id || uuid(), column_id: l.column_id, etapa: l.etapa, cliente_nome: l.cliente_nome||'', cliente_pix: l.cliente_pix||'', lead_nome: l.lead_nome, lead_whatsapp: l.lead_whatsapp||'', comentarios: l.comentarios||'', data_convite: l.data_convite||'', mes_referencia: l.mes_referencia || now.substring(0,7), historico: l.historico || [], criado_em: l.criado_em || now };
  const list = readStore('leads');
  list.push(lead); writeStore('leads', list);
  res.json({ id: lead.id });
});
app.put('/api/leads/:id', (req, res) => {
  const l = req.body;
  const list = readStore('leads');
  const idx = list.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  list[idx] = { ...list[idx], ...l, id: req.params.id };
  writeStore('leads', list);
  res.json({ ok: true });
});
app.delete('/api/leads/:id', (req, res) => {
  let list = readStore('leads');
  list = list.filter(x => x.id !== req.params.id);
  writeStore('leads', list);
  res.json({ ok: true });
});

// ---------- TRASH ----------
app.get('/api/trash', (req, res) => { res.json(readStore('trash')); });
app.post('/api/trash', (req, res) => {
  const lead = req.body;
  lead._deleted_at = new Date().toISOString();
  const trash = readStore('trash');
  trash.push(lead);
  writeStore('trash', trash);
  res.json({ ok: true });
});
app.post('/api/trash/:id/restore', (req, res) => {
  let trash = readStore('trash');
  const idx = trash.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  const lead = trash[idx];
  delete lead._deleted_at;
  trash.splice(idx, 1);
  writeStore('trash', trash);
  const leads = readStore('leads');
  leads.push(lead);
  writeStore('leads', leads);
  res.json({ ok: true });
});
app.delete('/api/trash/:id', (req, res) => {
  let trash = readStore('trash');
  trash = trash.filter(x => x.id !== req.params.id);
  writeStore('trash', trash);
  res.json({ ok: true });
});
app.delete('/api/trash', (req, res) => {
  writeStore('trash', []);
  res.json({ ok: true });
});

// ---------- CLIENTS ----------
app.get('/api/clients', (req, res) => {
  res.json(readStore('clients').sort((a,b) => (a.nome||'').localeCompare(b.nome||'')));
});
app.post('/api/clients', (req, res) => {
  const c = req.body;
  const cli = { id: c.id || uuid(), nome: c.nome, whatsapp: c.whatsapp||'', link_indicacao: c.link_indicacao||'', editado: c.editado || false };
  const list = readStore('clients');
  list.push(cli); writeStore('clients', list);
  res.json(cli);
});
app.put('/api/clients/:id', (req, res) => {
  const c = req.body;
  const list = readStore('clients');
  const idx = list.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  list[idx] = { ...list[idx], ...c, id: req.params.id };
  writeStore('clients', list);
  res.json({ ok: true });
});
app.delete('/api/clients/:id', (req, res) => {
  let list = readStore('clients');
  list = list.filter(x => x.id !== req.params.id);
  writeStore('clients', list);
  res.json({ ok: true });
});
app.post('/api/clients/sync', (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients)) return res.status(400).json({ error: 'Array esperado' });
  writeStore('clients', clients.map(c => ({ id: c.id||uuid(), nome: c.nome, whatsapp: c.whatsapp||'', link_indicacao: c.link_indicacao||'', editado: c.editado||false })));
  res.json({ ok: true, count: clients.length });
});

app.post('/api/clients/merge', (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients)) return res.status(400).json({ error: 'Array esperado' });
  const existing = readStore('clients');
  const existingMap = {};
  existing.forEach(c => { existingMap[c.id] = c; });
  let added = 0, updated = 0, kept = 0;
  clients.forEach(c => {
    const id = c.id || uuid();
    const nome = c.nome || '';
    const whatsapp = c.whatsapp || '';
    if (existingMap[id]) {
      if (existingMap[id].nome !== nome || existingMap[id].whatsapp !== whatsapp) {
        existingMap[id].nome = nome;
        existingMap[id].whatsapp = whatsapp;
        updated++;
      } else {
        kept++;
      }
    } else {
      existingMap[id] = { id, nome, whatsapp, link_indicacao: c.link_indicacao || '', editado: c.editado || false };
      added++;
    }
  });
  const merged = Object.values(existingMap);
  writeStore('clients', merged);
  res.json({ ok: true, total: merged.length, added, updated, kept });
});

app.post('/api/columns/sync', (req, res) => {
  const { columns } = req.body;
  if (!Array.isArray(columns)) return res.status(400).json({ error: 'Array esperado' });
  writeStore('columns', columns.map((c, i) => ({ id: c.id || uuid(), name: c.name, color: c.color || '#6b7280', order: c.order !== undefined ? c.order : i })));
  res.json({ ok: true, count: columns.length });
});

// ---------- PUBLIC INDICATION ----------
app.post('/api/public-indicacao', (req, res) => {
  const { isClient, clientName, leadName, leadWhatsapp, clientPix, pixType } = req.body;
  if (!clientName || !leadName || !leadWhatsapp) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
  }

  const tracking = uuid().slice(0, 8);
  const baseUrl = req.protocol + '://' + req.get('host');
  const link = baseUrl + '/indique.html?ref=' + tracking;

  const now = new Date().toISOString();
  const columns = readStore('columns').sort((a, b) => a.order - b.order);
  const firstColId = columns.length > 0 ? columns[0].id : 'pendentes';

  // Create or update client
  const clientsList = readStore('clients');
  const cleanPix = clientPix ? String(clientPix).trim() : '';
  let client = clientsList.find(c => (c.nome || '').trim().toUpperCase() === String(clientName).trim().toUpperCase());
  if (!client) {
    const newClientId = uuid();
    client = {
      id: newClientId,
      nome: String(clientName).trim().toUpperCase(),
      whatsapp: '',
      link_indicacao: `${baseUrl}/?ref=${newClientId}`,
      editado: false,
      pix: cleanPix,
      pix_tipo: pixType || 'celular'
    };
    clientsList.push(client);
    writeStore('clients', clientsList);
  } else if (cleanPix) {
    client.pix = cleanPix;
    client.pix_tipo = pixType || client.pix_tipo || 'celular';
    writeStore('clients', clientsList);
  }
  if (!client.link_indicacao) {
    client.link_indicacao = `${baseUrl}/?ref=${client.id}`;
    writeStore('clients', clientsList);
  }

  const lead = {
    id: uuid(),
    column_id: firstColId,
    etapa: firstColId,
    cliente_nome: String(clientName).trim().toUpperCase(),
    cliente_pix: isClient ? '' : cleanPix,
    pix_tipo: isClient ? '' : (pixType || 'celular'),
    lead_nome: String(leadName).trim().toUpperCase(),
    lead_whatsapp: String(leadWhatsapp).trim(),
    comentarios: isClient ? 'Indicação via página pública (cliente)' : 'Indicação via página pública (não cliente)',
    tracking: tracking,
    criado_em: now,
    mes_referencia: now.substring(0, 7),
    historico: [{ data: now, texto: 'Lead criado via página Indique e Ganhe' }]
  };

  const leads = readStore('leads');
  leads.push(lead);
  writeStore('leads', leads);

  res.json({ ok: true, link: link, tracking: tracking });
});

// ---------- CONFIG ----------
app.get('/api/config', (req, res) => { res.json(readObj('config')); });
app.put('/api/config', (req, res) => { writeObj('config', req.body); res.json({ ok: true }); });

// ---------- PREFS ----------
app.get('/api/prefs', (req, res) => { res.json(readObj('prefs')); });
app.put('/api/prefs', (req, res) => { writeObj('prefs', req.body); res.json({ ok: true }); });

// ---------- BACKUP / RESTORE ----------
app.get('/api/backup', (req, res) => {
  res.json({
    leads: readStore('leads'),
    columns: readStore('columns'),
    clients: readStore('clients'),
    users: readStore('users').map(u => ({ id:u.id, username:u.username, display_name:u.display_name })),
    trash: readStore('trash'),
    config: readObj('config'),
    prefs: readObj('prefs'),
  });
});
app.post('/api/restore', (req, res) => {
  const data = req.body;
  if (data.columns) writeStore('columns', data.columns);
  if (data.leads) writeStore('leads', data.leads);
  if (data.clients) writeStore('clients', data.clients);
  if (data.trash) writeStore('trash', data.trash);
  if (data.config) writeObj('config', data.config);
  if (data.prefs) writeObj('prefs', data.prefs);
  res.json({ ok: true });
});

// ---------- PUBLIC PAGES ----------
app.get('/indique', (req, res) => { res.sendFile(path.join(__dirname, 'indique.html')); });
app.get('/indique-e-ganhe', (req, res) => { res.sendFile(path.join(__dirname, 'indique.html')); });

// ---------- SPA fallback ----------
app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
  console.log('DATA_DIR:', DATA_DIR);
  const files = ['leads.json','columns.json','users.json','clients.json','trash.json','config.json','prefs.json'];
  files.forEach(f => {
    const fp = path.join(DATA_DIR, f);
    const exists = fs.existsSync(fp);
    console.log(`  ${f}: ${exists ? 'EXISTS (' + fs.statSync(fp).size + ' bytes)' : 'NOT FOUND'}`);
  });
});
