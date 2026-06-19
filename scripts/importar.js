/**
 * Importa convidados de um CSV simples: nome,telefone
 * Uso: node scripts/importar.js convidados.csv
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function gerarToken() {
  return crypto.randomBytes(12).toString('base64url');
}

const arquivo = process.argv[2];
if (!arquivo) {
  console.error('Uso: node scripts/importar.js convidados.csv');
  process.exit(1);
}

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'lista.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS convidados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    telefone TEXT,
    confirmado INTEGER NOT NULL DEFAULT 0,
    confirmado_em TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_convidados_token ON convidados(token);
`);

const colunas = db.prepare('PRAGMA table_info(convidados)').all();
if (!colunas.some((c) => c.name === 'token')) {
  db.exec('ALTER TABLE convidados ADD COLUMN token TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_convidados_token ON convidados(token)');
}

const insert = db.prepare('INSERT INTO convidados (nome, telefone, token) VALUES (?, ?, ?)');

const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/).filter(Boolean);
let count = 0;

const tx = db.transaction(() => {
  for (const linha of linhas) {
    const [nome, telefone] = linha.split(',').map((s) => s.trim());
    if (!nome || nome.toLowerCase() === 'nome') continue;
    insert.run(nome, telefone || null, gerarToken());
    count++;
  }
});

tx();
console.log(`${count} convidado(s) importado(s).`);
