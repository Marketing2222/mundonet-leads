import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import fetch from 'node-fetch';

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

function fixClientNamesUppercase() {
  const list = readStore('clients');
  let fixed = 0;
  list.forEach(c => {
    if (c.nome && c.nome !== c.nome.toUpperCase()) {
      c.nome = c.nome.toUpperCase();
      fixed++;
    }
  });
  list.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  writeStore('clients', list);
  console.log('fixClientNamesUppercase: ' + fixed + ' nomes corrigidos, ' + list.length + ' clientes ordenados');
}
fixClientNamesUppercase();

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
  if (!lead._deleted_at) lead._deleted_at = new Date().toISOString();
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
  delete lead._source;
  trash.splice(idx, 1);
  writeStore('trash', trash);
  const leads = readStore('leads');
  leads.push(lead);
  writeStore('leads', leads);
  res.json({ ok: true });
});
app.post('/api/trash/:id/restore-client', (req, res) => {
  let trash = readStore('trash');
  const idx = trash.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  const client = trash[idx];
  delete client._deleted_at;
  delete client._source;
  trash.splice(idx, 1);
  writeStore('trash', trash);
  const clients = readStore('clients');
  clients.push(client);
  writeStore('clients', clients);
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

// ---------- ARCHIVED ----------
app.get('/api/archived', (req, res) => { res.json(readStore('archived')); });
app.post('/api/archived', (req, res) => {
  const client = req.body;
  client._archived_at = new Date().toISOString();
  const archived = readStore('archived');
  archived.push(client);
  writeStore('archived', archived);
  res.json({ ok: true });
});
app.post('/api/archived/:id/restore', (req, res) => {
  let archived = readStore('archived');
  const idx = archived.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Não encontrado' });
  const client = archived[idx];
  delete client._archived_at;
  archived.splice(idx, 1);
  writeStore('archived', archived);
  const clients = readStore('clients');
  clients.push(client);
  writeStore('clients', clients);
  res.json({ ok: true });
});
app.delete('/api/archived/:id', (req, res) => {
  let archived = readStore('archived');
  archived = archived.filter(x => x.id !== req.params.id);
  writeStore('archived', archived);
  res.json({ ok: true });
});
app.delete('/api/archived', (req, res) => {
  writeStore('archived', []);
  res.json({ ok: true });
});

// ---------- CLIENTS ----------
app.get('/api/clients', (req, res) => {
  res.json(readStore('clients').sort((a,b) => (a.nome||'').localeCompare(b.nome||'')));
});
app.post('/api/clients', (req, res) => {
  const c = req.body;
  const cli = { id: c.id || uuid(), nome: c.nome, whatsapp: c.whatsapp||'', cpf: c.cpf||'', link_indicacao: c.link_indicacao||'', editado: c.editado || false };
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
app.post('/api/clients/batch-trash', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Array esperado' });
  const idSet = new Set(ids);
  let list = readStore('clients');
  const trashed = list.filter(c => idSet.has(c.id));
  trashed.forEach(c => { c._source = 'client'; c._deleted_at = new Date().toISOString(); });
  const trash = readStore('trash');
  trash.push(...trashed);
  writeStore('trash', trash);
  list = list.filter(c => !idSet.has(c.id));
  writeStore('clients', list);
  res.json({ ok: true, deleted: idSet.size });
});
app.post('/api/clients/batch-archive', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Array esperado' });
  const idSet = new Set(ids);
  let list = readStore('clients');
  const archived = list.filter(c => idSet.has(c.id));
  archived.forEach(c => { c._archived_at = new Date().toISOString(); });
  const arch = readStore('archived');
  arch.push(...archived);
  writeStore('archived', arch);
  list = list.filter(c => !idSet.has(c.id));
  writeStore('clients', list);
  res.json({ ok: true, archived: idSet.size });
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
        if (c.cpf) existingMap[id].cpf = c.cpf;
        if (c.email) existingMap[id].email = c.email;
        updated++;
      } else {
        kept++;
      }
    } else {
      existingMap[id] = { id, nome, whatsapp, cpf: c.cpf || '', email: c.email || '', link_indicacao: c.link_indicacao || '', editado: c.editado || false };
      added++;
    }
  });
  const merged = Object.values(existingMap);
  writeStore('clients', merged);
  res.json({ ok: true, total: merged.length, added, updated, kept });
});

app.post('/api/clients/import', (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients)) return res.status(400).json({ error: 'Array esperado' });
  const existing = readStore('clients');
  const existingMap = {};
  existing.forEach(c => {
    const ek = (c.cpf && String(c.cpf).trim()) ? 'cpf_'+String(c.cpf).trim() : ((c.nome||'').trim()+'_'+(c.whatsapp||'').trim());
    existingMap[ek] = c;
  });
  let added = 0, updated = 0, kept = 0;
  clients.forEach(c => {
    const key = (c.cpf && c.cpf.trim()) ? 'cpf_'+c.cpf.trim() : (c.nome.trim()+'_'+c.whatsapp.trim());
    const nome = (c.nome || '').trim();
    const whatsapp = (c.whatsapp || '').trim();
    if (!nome) return;
    if (existingMap[key]) {
      if (c.whatsapp && existingMap[key].whatsapp !== whatsapp) { existingMap[key].whatsapp = whatsapp; updated++; }
      if (c.cpf && !existingMap[key].cpf) { existingMap[key].cpf = c.cpf; updated++; }
      if (c.email && !existingMap[key].email) { existingMap[key].email = c.email; updated++; }
      if (!updated) kept++;
    } else {
      const id = uuid();
      existingMap[key] = { id, nome, whatsapp, cpf: c.cpf || '', email: c.email || '', link_indicacao: '', editado: false };
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

// ---------- PUBLIC: CHECK WHATSAPP ----------
app.post('/api/public-indicacao/check-whatsapp', (req, res) => {
  const { whatsapp } = req.body;
  if (!whatsapp) return res.status(400).json({ error: 'WhatsApp obrigatório' });
  const clients = readStore('clients');
  const clean = String(whatsapp).replace(/\D/g, '');
  const match = clients.find(c => {
    const cWp = String(c.whatsapp || '').replace(/\D/g, '');
    return cWp === clean;
  });
  if (match) {
    return res.json({ nome: match.nome });
  }
  res.json({ nome: null });
});
app.post('/api/public-indicacao/check-cpf', (req, res) => {
  const { cpf } = req.body;
  if (!cpf) return res.status(400).json({ error: 'CPF obrigatório' });
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length < 11) return res.json({ nome: null });
  const clients = readStore('clients');
  const match = clients.find(c => {
    const cCpf = String(c.cpf || '').replace(/\D/g, '');
    return cCpf === clean;
  });
  if (match && match.nome) {
    return res.json({ nome: match.nome });
  }
  res.json({ nome: null });
});

// ---------- PUBLIC INDICATION ----------
app.post('/api/public-indicacao', (req, res) => {
  const { isClient, clientCPF, clientName, leadName, leadWhatsapp, clientPix, pixType } = req.body;
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

// ---------- IXC PROXY ----------
function ixcAuth(token) {
  if (token.includes(':')) {
    const [user, pass] = token.split(':');
    return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  }
  return 'Basic ' + Buffer.from(token).toString('base64');
}

app.get('/api/clients/fetch-ixc', async (req, res) => {
  const cfg = readObj('config');
  let url = cfg.ixc_url;
  const token = cfg.ixc_token;
  if (!url || !token) return res.status(400).json({ error: 'Configure URL e Token do IXC primeiro' });
  if (!url.startsWith('http')) url = 'https://' + url;
  url = url.replace(/\/+$/, '');

  try {
    const allClients = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const resp = await fetch(`${url}/cliente`, {
        method: 'POST',
        headers: {
          'Authorization': ixcAuth(token),
          'iusession': token,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: `_search=false&page=${page}&rp=100&sortname=cliente.id&sortorder=desc`
      });
      if (!resp.ok) {
        const body = await resp.text().catch(()=>'');
        throw new Error(`HTTP ${resp.status} ${resp.statusText} - ${body.substring(0,300)}`);
      }
      const data = await resp.json();
      console.log('IXC response keys:', Object.keys(data));
      console.log('IXC response sample:', JSON.stringify(data).substring(0, 500));
      let items = [];
      if (Array.isArray(data)) items = data;
      else if (data.data && Array.isArray(data.data)) items = data.data;
      else if (data.clientes && Array.isArray(data.clientes)) items = data.clientes;
      else if (data.registros && Array.isArray(data.registros)) items = data.registros;
      else if (data.rows && Array.isArray(data.rows)) items = data.rows;
      else if (data.results && Array.isArray(data.results)) items = data.results;
      else {
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key]) && data[key].length > 0 && data[key][0].id) { items = data[key]; break; }
        }
      }
      if (Array.isArray(items)) {
        items.forEach(c => {
          allClients.push({
            id: c.id || ('ixc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
            nome: c.nome || c.name || c.razao_social || '',
            whatsapp: c.whatsapp || c.telefone || c.celular || c.phone || '',
            link_indicacao: '',
            editado: false
          });
        });
      }
      hasMore = items.length === 100;
      page++;
      if (page > 50) break;
    }
    res.json({ clients: allClients });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar clientes IXC: ' + e.message });
  }
});

// ---------- IXC TEST ----------
app.get('/api/clients/test-ixc', async (req, res) => {
  const cfg = readObj('config');
  let url = cfg.ixc_url;
  const token = cfg.ixc_token;
  if (!url || !token) return res.status(400).json({ error: 'Configure URL e Token do IXC primeiro' });
  if (!url.startsWith('http')) url = 'https://' + url;
  url = url.replace(/\/+$/, '');

  const methods = [
    { name: 'Basic Auth (token inteiro)', headers: { 'Authorization': 'Basic ' + Buffer.from(token).toString('base64') } },
    { name: 'iusession header', headers: { 'iusession': token } },
    { name: 'Bearer token', headers: { 'Authorization': 'Bearer ' + token } },
  ];

  const results = [];
  for (const m of methods) {
    try {
      const resp = await fetch(`${url}/cliente?page=1&limit=1`, {
        headers: { ...m.headers, 'Content-Type': 'application/json', 'Accept': 'application/json' }
      });
      const body = await resp.text().catch(()=>'');
      results.push({ method: m.name, status: resp.status, statusText: resp.statusText, body: body.substring(0,500) });
    } catch (e) {
      results.push({ method: m.name, error: e.message });
    }
  }
  res.json({ url, results });
});

// ---------- IXC DEBUG ----------
app.get('/api/debug-ixc', async (req, res) => {
  const cfg = readObj('config');
  let url = cfg.ixc_url;
  const token = cfg.ixc_token;
  if (!url || !token) return res.status(400).json({ error: 'Configure URL e Token do IXC primeiro' });
  if (!url.startsWith('http')) url = 'https://' + url;
  url = url.replace(/\/+$/, '');
  const auth = ixcAuth(token);
  const tests = [];

  const listParams = 'oper=&qtype=ativo&query=S&page=1&rp=5&sortname=cliente.id&sortorder=desc';

  const combos = [
    { name: 'POST /cliente CPF wildcard 000', body: 'qtype=cnpj_cpf&oper=like&query=000&page=1&rp=5&sortname=cliente.id&sortorder=desc' },
    { name: 'POST /cliente CPF bw vazio', body: 'qtype=cnpj_cpf&oper=bw&query=&page=1&rp=5&sortname=cliente.id&sortorder=desc' },
    { name: 'POST /cliente ativo bw', body: 'qtype=ativo&oper=bw&query=S&page=1&rp=5&sortname=cliente.id&sortorder=desc' },
    { name: 'POST /cliente ativo eq', body: 'qtype=ativo&oper=eq&query=S&page=1&rp=5&sortname=cliente.id&sortorder=desc' },
    { name: 'POST /cliente razao_social bw', body: 'qtype=razao_social&oper=bw&query=&page=1&rp=5&sortname=cliente.id&sortorder=desc' },
    { name: 'POST /cliente nome bw', body: 'qtype=nome&oper=bw&query=&page=1&rp=5&sortname=cliente.id&sortorder=desc' },
    { name: 'POST /lead (testar rota)', body: 'page=1&rp=5&sortname=lead.id&sortorder=desc' },
    { name: 'POST /prospeccao (testar rota)', body: 'page=1&rp=5&sortname=id&sortorder=desc' },
  ];

  for (const c of combos) {
    try {
      const reqUrl = `${url}${c.route || '/cliente'}${c.url_suffix || ''}`;
      const hdrs = { 'Authorization': auth, 'iusession': token, 'Accept': 'application/json' };
      if (c.json) hdrs['Content-Type'] = 'application/json';
      else hdrs['Content-Type'] = 'application/x-www-form-urlencoded';
      if (c.headers_extra) Object.assign(hdrs, c.headers_extra);
      const opts = { method: c.method || 'POST', headers: hdrs };
      if (c.body !== undefined && c.body !== null) opts.body = c.body;
      const r = await fetch(reqUrl, opts);
      const body = await r.text();
      const hasList = body.includes('"total"') || body.includes('"rows"') || body.includes('"records"');
      const hasError = body.includes('"error"');
      tests.push({ name: c.name, status: r.status, result: hasList ? 'LIST OK!' : hasError ? 'ERROR' : 'OTHER', body: body.substring(0, 500) });
    } catch(e) { tests.push({ name: c.name, error: e.message }); }
  }
  res.json({ url, tests });
});

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
    archived: readStore('archived'),
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
  if (data.archived) writeStore('archived', data.archived);
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
  const files = ['leads.json','columns.json','users.json','clients.json','trash.json','archived.json','config.json','prefs.json'];
  files.forEach(f => {
    const fp = path.join(DATA_DIR, f);
    const exists = fs.existsSync(fp);
    console.log(`  ${f}: ${exists ? 'EXISTS (' + fs.statSync(fp).size + ' bytes)' : 'NOT FOUND'}`);
  });
});
