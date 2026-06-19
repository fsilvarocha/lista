const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const ADMIN_SENHA = process.env.ADMIN_SENHA || 'admin123';
const BASE_URL = process.env.BASE_URL || '';

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'lista.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS convidados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    confirmado INTEGER NOT NULL DEFAULT 0,
    confirmado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_convidados_nome ON convidados(nome);
  CREATE INDEX IF NOT EXISTS idx_convidados_telefone ON convidados(telefone);
`);

const colunas = db.prepare('PRAGMA table_info(convidados)').all();
if (!colunas.some((c) => c.name === 'token')) {
  db.exec('ALTER TABLE convidados ADD COLUMN token TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_convidados_token ON convidados(token)');
}

function gerarToken() {
  return crypto.randomBytes(12).toString('base64url');
}

function garantirToken(convidado) {
  if (convidado.token) return convidado.token;
  const token = gerarToken();
  db.prepare('UPDATE convidados SET token = ? WHERE id = ?').run(token, convidado.id);
  return token;
}

db.prepare('SELECT id, token FROM convidados WHERE token IS NULL').all().forEach((c) => {
  db.prepare('UPDATE convidados SET token = ? WHERE id = ?').run(gerarToken(), c.id);
});

function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizarTelefone(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function linkConvidado(token, req) {
  const base = BASE_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/?t=${token}`;
}

function buscarConvidado(busca) {
  const buscaTexto = normalizarTexto(busca);
  const buscaTel = normalizarTelefone(busca);

  const convidados = db.prepare('SELECT * FROM convidados').all();
  return convidados.find((c) => {
    const nomeMatch = normalizarTexto(c.nome) === buscaTexto;
    const telMatch = buscaTel.length >= 8 && normalizarTelefone(c.telefone) === buscaTel;
    return nomeMatch || telMatch;
  });
}

function confirmarConvidado(encontrado, res) {
  if (encontrado.confirmado) {
    return res.json({
      ok: true,
      jaConfirmado: true,
      mensagem: `Olá, ${encontrado.nome}! Sua presença já estava confirmada.`,
      nome: encontrado.nome,
    });
  }

  const agora = new Date().toISOString();
  db.prepare('UPDATE convidados SET confirmado = 1, confirmado_em = ? WHERE id = ?').run(
    agora,
    encontrado.id
  );

  return res.json({
    ok: true,
    jaConfirmado: false,
    mensagem: `Obrigado, ${encontrado.nome}! Presença confirmada com sucesso.`,
    nome: encontrado.nome,
  });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/convidado/:token', (req, res) => {
  const encontrado = db.prepare('SELECT * FROM convidados WHERE token = ?').get(req.params.token);
  if (!encontrado) {
    return res.status(404).json({ ok: false, mensagem: 'Link inválido ou expirado.' });
  }

  return res.json({
    ok: true,
    nome: encontrado.nome,
    confirmado: !!encontrado.confirmado,
    confirmado_em: encontrado.confirmado_em,
  });
});

app.post('/api/confirmar', (req, res) => {
  const { busca, token } = req.body;

  if (token) {
    const encontrado = db.prepare('SELECT * FROM convidados WHERE token = ?').get(token);
    if (!encontrado) {
      return res.status(404).json({ ok: false, mensagem: 'Link inválido ou expirado.' });
    }
    return confirmarConvidado(encontrado, res);
  }

  if (!busca || !String(busca).trim()) {
    return res.status(400).json({ ok: false, mensagem: 'Informe seu nome ou telefone.' });
  }

  const encontrado = buscarConvidado(busca);

  if (!encontrado) {
    return res.status(404).json({
      ok: false,
      mensagem: 'Não encontramos seu nome na lista. Verifique a digitação ou fale com o organizador.',
    });
  }

  return confirmarConvidado(encontrado, res);
});

app.get('/api/convidados', (req, res) => {
  const { senha } = req.query;
  if (senha !== ADMIN_SENHA) {
    return res.status(401).json({ ok: false, mensagem: 'Senha incorreta.' });
  }

  const convidados = db
    .prepare('SELECT id, nome, telefone, token, confirmado, confirmado_em FROM convidados ORDER BY nome COLLATE NOCASE')
    .all()
    .map((c) => {
      const token = garantirToken(c);
      return { ...c, token, link: linkConvidado(token, req) };
    });

  const total = convidados.length;
  const confirmados = convidados.filter((c) => c.confirmado).length;

  return res.json({
    ok: true,
    resumo: { total, confirmados, pendentes: total - confirmados },
    convidados,
  });
});

app.post('/api/convidados', (req, res) => {
  const { senha, nome, telefone } = req.body;
  if (senha !== ADMIN_SENHA) {
    return res.status(401).json({ ok: false, mensagem: 'Senha incorreta.' });
  }
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ ok: false, mensagem: 'Nome é obrigatório.' });
  }

  const token = gerarToken();
  const info = db
    .prepare('INSERT INTO convidados (nome, telefone, token) VALUES (?, ?, ?)')
    .run(String(nome).trim(), telefone ? String(telefone).trim() : null, token);

  return res.json({
    ok: true,
    id: info.lastInsertRowid,
    link: linkConvidado(token, req),
  });
});

app.delete('/api/convidados/:id', (req, res) => {
  const { senha } = req.body;
  if (senha !== ADMIN_SENHA) {
    return res.status(401).json({ ok: false, mensagem: 'Senha incorreta.' });
  }

  db.prepare('DELETE FROM convidados WHERE id = ?').run(req.params.id);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Painel admin: http://localhost:${PORT}/admin.html`);
  console.log(`Senha admin padrão: ${ADMIN_SENHA} (altere com ADMIN_SENHA=...)`);
});
