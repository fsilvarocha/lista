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
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS convidados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    confirmado INTEGER NOT NULL DEFAULT 0,
    confirmado_em TEXT
  );
  CREATE TABLE IF NOT EXISTS grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    confirmado INTEGER NOT NULL DEFAULT 0,
    confirmado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_convidados_nome ON convidados(nome);
  CREATE INDEX IF NOT EXISTS idx_convidados_telefone ON convidados(telefone);
`);

const colunasConv = db.prepare('PRAGMA table_info(convidados)').all();
if (!colunasConv.some((c) => c.name === 'token')) {
  db.exec('ALTER TABLE convidados ADD COLUMN token TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_convidados_token ON convidados(token)');
}
if (!colunasConv.some((c) => c.name === 'grupo_id')) {
  db.exec('ALTER TABLE convidados ADD COLUMN grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE');
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

function baseUrl(req) {
  return BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function linkConvidado(token, req) {
  return `${baseUrl(req)}/?t=${token}`;
}

function linkGrupo(token, req) {
  return `${baseUrl(req)}/?g=${token}`;
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

function membrosDoGrupo(grupoId) {
  return db
    .prepare('SELECT id, nome, telefone, confirmado FROM convidados WHERE grupo_id = ? ORDER BY nome COLLATE NOCASE')
    .all(grupoId);
}

function confirmarGrupoPorId(grupoId) {
  const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(grupoId);
  if (!grupo) return null;

  const membros = membrosDoGrupo(grupoId);
  const nomes = membros.map((m) => m.nome).join(', ');

  if (grupo.confirmado) {
    return {
      ok: true,
      jaConfirmado: true,
      mensagem: `A presença de ${nomes} já estava confirmada.`,
      nomes: membros.map((m) => m.nome),
    };
  }

  const agora = new Date().toISOString();
  db.prepare('UPDATE grupos SET confirmado = 1, confirmado_em = ? WHERE id = ?').run(agora, grupoId);
  db.prepare('UPDATE convidados SET confirmado = 1, confirmado_em = ? WHERE grupo_id = ?').run(agora, grupoId);

  return {
    ok: true,
    jaConfirmado: false,
    mensagem: `Obrigado! Presença confirmada para: ${nomes}.`,
    nomes: membros.map((m) => m.nome),
  };
}

function confirmarConvidado(encontrado, res) {
  if (encontrado.grupo_id) {
    const resultado = confirmarGrupoPorId(encontrado.grupo_id);
    if (!resultado) {
      return res.status(404).json({ ok: false, mensagem: 'Grupo não encontrado.' });
    }
    return res.json(resultado);
  }

  if (encontrado.confirmado) {
    return res.json({
      ok: true,
      jaConfirmado: true,
      mensagem: `Olá, ${encontrado.nome}! Sua presença já estava confirmada.`,
      nome: encontrado.nome,
    });
  }

  const agora = new Date().toISOString();
  db.prepare('UPDATE convidados SET confirmado = 1, confirmado_em = ? WHERE id = ?').run(agora, encontrado.id);

  return res.json({
    ok: true,
    jaConfirmado: false,
    mensagem: `Obrigado, ${encontrado.nome}! Presença confirmada com sucesso.`,
    nome: encontrado.nome,
  });
}

function desconfirmarGrupo(grupoId) {
  db.prepare('UPDATE grupos SET confirmado = 0, confirmado_em = NULL WHERE id = ?').run(grupoId);
  db.prepare('UPDATE convidados SET confirmado = 0, confirmado_em = NULL WHERE grupo_id = ?').run(grupoId);
}

function checarSenha(senha, res) {
  if (senha !== ADMIN_SENHA) {
    res.status(401).json({ ok: false, mensagem: 'Senha incorreta.' });
    return false;
  }
  return true;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/convidado/:token', (req, res) => {
  const encontrado = db.prepare('SELECT * FROM convidados WHERE token = ?').get(req.params.token);
  if (!encontrado) {
    return res.status(404).json({ ok: false, mensagem: 'Link inválido ou expirado.' });
  }

  if (encontrado.grupo_id) {
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(encontrado.grupo_id);
    const membros = membrosDoGrupo(encontrado.grupo_id);
    return res.json({
      ok: true,
      tipo: 'grupo',
      nome: encontrado.nome,
      grupo: grupo.nome,
      membros: membros.map((m) => m.nome),
      confirmado: !!grupo.confirmado,
      confirmado_em: grupo.confirmado_em,
      grupoToken: grupo.token,
    });
  }

  return res.json({
    ok: true,
    tipo: 'individual',
    nome: encontrado.nome,
    confirmado: !!encontrado.confirmado,
    confirmado_em: encontrado.confirmado_em,
  });
});

app.get('/api/grupo/:token', (req, res) => {
  const grupo = db.prepare('SELECT * FROM grupos WHERE token = ?').get(req.params.token);
  if (!grupo) {
    return res.status(404).json({ ok: false, mensagem: 'Link inválido ou expirado.' });
  }

  const membros = membrosDoGrupo(grupo.id);
  return res.json({
    ok: true,
    nome: grupo.nome,
    membros: membros.map((m) => m.nome),
    confirmado: !!grupo.confirmado,
    confirmado_em: grupo.confirmado_em,
  });
});

app.post('/api/confirmar', (req, res) => {
  const { busca, token, grupo: grupoToken } = req.body;

  if (grupoToken) {
    const grupo = db.prepare('SELECT * FROM grupos WHERE token = ?').get(grupoToken);
    if (!grupo) {
      return res.status(404).json({ ok: false, mensagem: 'Link inválido ou expirado.' });
    }
    const resultado = confirmarGrupoPorId(grupo.id);
    return res.json(resultado);
  }

  if (token) {
    const encontrado = db.prepare('SELECT * FROM convidados WHERE token = ?').get(token);
    if (!encontrado) {
      return res.status(404).json({ ok: false, mensagem: 'Link inválido ou expirado.' });
    }
    if (encontrado.grupo_id) {
      const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(encontrado.grupo_id);
      const resultado = confirmarGrupoPorId(grupo.id);
      return res.json(resultado);
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

function montarListaAdmin(req) {
  const convidados = db
    .prepare(`
      SELECT c.id, c.nome, c.telefone, c.token, c.confirmado, c.confirmado_em, c.grupo_id,
             g.nome AS grupo_nome, g.token AS grupo_token, g.confirmado AS grupo_confirmado
      FROM convidados c
      LEFT JOIN grupos g ON g.id = c.grupo_id
      ORDER BY COALESCE(g.nome, c.nome) COLLATE NOCASE, c.nome COLLATE NOCASE
    `)
    .all()
    .map((c) => {
      const token = garantirToken(c);
      const emGrupo = !!c.grupo_id;
      const confirmado = emGrupo ? !!c.grupo_confirmado : !!c.confirmado;
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        token,
        confirmado,
        confirmado_em: c.confirmado_em,
        grupo_id: c.grupo_id,
        grupo_nome: c.grupo_nome,
        link: emGrupo ? linkGrupo(c.grupo_token, req) : linkConvidado(token, req),
        tipo: emGrupo ? 'grupo' : 'individual',
      };
    });

  const grupos = db
    .prepare('SELECT * FROM grupos ORDER BY nome COLLATE NOCASE')
    .all()
    .map((g) => ({
      id: g.id,
      nome: g.nome,
      token: g.token,
      confirmado: !!g.confirmado,
      confirmado_em: g.confirmado_em,
      link: linkGrupo(g.token, req),
      membros: membrosDoGrupo(g.id),
    }));

  const total = convidados.length;
  const confirmados = convidados.filter((c) => c.confirmado).length;

  return {
    convidados,
    grupos,
    resumo: { total, confirmados, pendentes: total - confirmados },
  };
}

app.get('/api/convidados', (req, res) => {
  if (!checarSenha(req.query.senha, res)) return;
  return res.json({ ok: true, ...montarListaAdmin(req) });
});

app.post('/api/convidados', (req, res) => {
  const { senha, nome, telefone } = req.body;
  if (!checarSenha(senha, res)) return;
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

app.post('/api/grupos', (req, res) => {
  const { senha, nome, membros } = req.body;
  if (!checarSenha(senha, res)) return;
  if (!nome || !String(nome).trim()) {
    return res.status(400).json({ ok: false, mensagem: 'Nome do grupo é obrigatório.' });
  }
  if (!Array.isArray(membros) || membros.length === 0) {
    return res.status(400).json({ ok: false, mensagem: 'Adicione pelo menos uma pessoa ao grupo.' });
  }

  const tokenGrupo = gerarToken();
  const criar = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO grupos (nome, token) VALUES (?, ?)')
      .run(String(nome).trim(), tokenGrupo);

    const grupoId = info.lastInsertRowid;
    const insert = db.prepare(
      'INSERT INTO convidados (nome, telefone, token, grupo_id) VALUES (?, ?, ?, ?)'
    );

    for (const m of membros) {
      if (!m.nome || !String(m.nome).trim()) continue;
      insert.run(
        String(m.nome).trim(),
        m.telefone ? String(m.telefone).trim() : null,
        gerarToken(),
        grupoId
      );
    }

    return grupoId;
  });

  const grupoId = criar();
  const membrosCriados = membrosDoGrupo(grupoId);
  if (membrosCriados.length === 0) {
    db.prepare('DELETE FROM grupos WHERE id = ?').run(grupoId);
    return res.status(400).json({ ok: false, mensagem: 'Nenhum membro válido no grupo.' });
  }

  return res.json({
    ok: true,
    id: grupoId,
    link: linkGrupo(tokenGrupo, req),
    membros: membrosCriados,
  });
});

app.post('/api/convidados/:id/desconfirmar', (req, res) => {
  const { senha } = req.body;
  if (!checarSenha(senha, res)) return;

  const convidado = db.prepare('SELECT * FROM convidados WHERE id = ?').get(req.params.id);
  if (!convidado) {
    return res.status(404).json({ ok: false, mensagem: 'Convidado não encontrado.' });
  }

  if (convidado.grupo_id) {
    desconfirmarGrupo(convidado.grupo_id);
  } else {
    db.prepare('UPDATE convidados SET confirmado = 0, confirmado_em = NULL WHERE id = ?').run(convidado.id);
  }

  return res.json({ ok: true });
});

app.post('/api/grupos/:id/desconfirmar', (req, res) => {
  const { senha } = req.body;
  if (!checarSenha(senha, res)) return;

  const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(req.params.id);
  if (!grupo) {
    return res.status(404).json({ ok: false, mensagem: 'Grupo não encontrado.' });
  }

  desconfirmarGrupo(grupo.id);
  return res.json({ ok: true });
});

app.delete('/api/convidados/:id', (req, res) => {
  const { senha } = req.body;
  if (!checarSenha(senha, res)) return;

  const convidado = db.prepare('SELECT * FROM convidados WHERE id = ?').get(req.params.id);
  if (!convidado) {
    return res.status(404).json({ ok: false, mensagem: 'Convidado não encontrado.' });
  }

  if (convidado.grupo_id) {
    const restantes = db
      .prepare('SELECT COUNT(*) AS n FROM convidados WHERE grupo_id = ? AND id != ?')
      .get(convidado.grupo_id, convidado.id);
    db.prepare('DELETE FROM convidados WHERE id = ?').run(convidado.id);
    if (restantes.n === 0) {
      db.prepare('DELETE FROM grupos WHERE id = ?').run(convidado.grupo_id);
    }
  } else {
    db.prepare('DELETE FROM convidados WHERE id = ?').run(convidado.id);
  }

  return res.json({ ok: true });
});

app.delete('/api/grupos/:id', (req, res) => {
  const { senha } = req.body;
  if (!checarSenha(senha, res)) return;

  const grupoId = req.params.id;
  db.prepare('DELETE FROM convidados WHERE grupo_id = ?').run(grupoId);
  db.prepare('DELETE FROM grupos WHERE id = ?').run(grupoId);
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`Painel admin: http://localhost:${PORT}/admin.html`);
  console.log(`Senha admin padrão: ${ADMIN_SENHA} (altere com ADMIN_SENHA=...)`);
});
