import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

let db: Database.Database

export function initDatabase(): Database.Database {
  const userDataPath = app.getPath('userData')
  const dbDir = join(userDataPath, 'data')
  mkdirSync(dbDir, { recursive: true })

  const dbPath = join(dbDir, 'playkids.db')
  console.log('[DB] Banco de dados:', dbPath)
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function resetLocalData(db: Database.Database): void {
  const tables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all() as { name: string }[])
  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`)
  }
  runMigrations(db)
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS estabelecimentos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      cnpj TEXT,
      endereco TEXT,
      telefone TEXT,
      ativo INTEGER DEFAULT 1,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS configuracoes_preco (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      idade_min INTEGER,
      idade_max INTEGER,
      valor_base REAL NOT NULL DEFAULT 25,
      minutos_base INTEGER NOT NULL DEFAULT 30,
      faixas_intermediarias TEXT NOT NULL DEFAULT '[]',
      franquia_minutos INTEGER NOT NULL DEFAULT 60,
      valor_bloco REAL NOT NULL DEFAULT 5,
      minutos_por_bloco INTEGER NOT NULL DEFAULT 15,
      ativo INTEGER DEFAULT 1,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (estabelecimento_id) REFERENCES estabelecimentos(id)
    );

    CREATE TABLE IF NOT EXISTS operadores (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      login TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      nivel_acesso TEXT DEFAULT 'operador',
      ativo INTEGER DEFAULT 1,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (estabelecimento_id) REFERENCES estabelecimentos(id)
    );

    CREATE TABLE IF NOT EXISTS responsaveis (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      cpf TEXT,
      telefone TEXT,
      email TEXT,
      observacoes TEXT,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (estabelecimento_id) REFERENCES estabelecimentos(id)
    );

    CREATE TABLE IF NOT EXISTS criancas (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT NOT NULL,
      responsavel_id TEXT,
      nome TEXT NOT NULL,
      data_nascimento TEXT,
      observacoes TEXT,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      atualizado_em TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (estabelecimento_id) REFERENCES estabelecimentos(id),
      FOREIGN KEY (responsavel_id) REFERENCES responsaveis(id)
    );

    CREATE TABLE IF NOT EXISTS visitas (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT NOT NULL,
      crianca_id TEXT NOT NULL,
      responsavel_id TEXT,
      operador_id TEXT,
      entrada_em TEXT NOT NULL,
      saida_em TEXT,
      valor_total REAL,
      status TEXT DEFAULT 'ativa',
      observacoes TEXT,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (estabelecimento_id) REFERENCES estabelecimentos(id),
      FOREIGN KEY (crianca_id) REFERENCES criancas(id),
      FOREIGN KEY (responsavel_id) REFERENCES responsaveis(id),
      FOREIGN KEY (operador_id) REFERENCES operadores(id)
    );

    CREATE TABLE IF NOT EXISTS visita_faixas_aplicadas (
      id TEXT PRIMARY KEY,
      visita_id TEXT NOT NULL,
      configuracao_preco_id TEXT NOT NULL,
      minutos INTEGER NOT NULL,
      valor REAL NOT NULL,
      sincronizado INTEGER DEFAULT 0,
      FOREIGN KEY (visita_id) REFERENCES visitas(id),
      FOREIGN KEY (configuracao_preco_id) REFERENCES configuracoes_preco(id)
    );

    CREATE TABLE IF NOT EXISTS fechamentos_caixa (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT NOT NULL,
      operador_id TEXT,
      abertura_em TEXT NOT NULL,
      fechamento_em TEXT,
      total_entradas INTEGER DEFAULT 0,
      total_valor REAL DEFAULT 0,
      status TEXT DEFAULT 'aberto',
      observacoes TEXT,
      sincronizado INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (estabelecimento_id) REFERENCES estabelecimentos(id),
      FOREIGN KEY (operador_id) REFERENCES operadores(id)
    );

    CREATE TABLE IF NOT EXISTS logs_auditoria (
      id TEXT PRIMARY KEY,
      estabelecimento_id TEXT,
      operador_id TEXT,
      acao TEXT NOT NULL,
      entidade TEXT,
      entidade_id TEXT,
      dados_antes TEXT,
      dados_depois TEXT,
      criado_em TEXT DEFAULT (datetime('now')),
      sincronizado INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_visitas_status ON visitas(status);
    CREATE INDEX IF NOT EXISTS idx_visitas_entrada ON visitas(entrada_em);
    CREATE INDEX IF NOT EXISTS idx_criancas_nome ON criancas(nome);
    CREATE INDEX IF NOT EXISTS idx_responsaveis_nome ON responsaveis(nome);
  `)

  migrateConfiguracoesPrecoColunas(db)
  migrateVisitasColunas(db)
  migrateCriancasColunas(db)
  migrateFechamentosCaixaColunas(db)
  ensureConfiguracoesSistema(db)
  ensureEstabelecimento(db)
  ensureDefaultPricingConfig(db)
  deduplicatePricingConfigs(db)
}

function ensureEstabelecimento(db: Database.Database): void {
  const id = process.env.VITE_ESTABELECIMENTO_ID ?? '539eef80-ec1a-4567-98a2-f5dd0ab1c8c4'
  db.prepare(`
    INSERT OR IGNORE INTO estabelecimentos (id, nome, ativo)
    VALUES (?, 'PlayKids', 1)
  `).run(id)
}

function ensureDefaultPricingConfig(db: Database.Database): void {
  const id = process.env.VITE_ESTABELECIMENTO_ID ?? '539eef80-ec1a-4567-98a2-f5dd0ab1c8c4'
  const existing = db.prepare(
    'SELECT id FROM configuracoes_preco WHERE estabelecimento_id = ? AND ativo = 1 LIMIT 1'
  ).get(id)
  if (!existing) {
    db.prepare(`
      INSERT INTO configuracoes_preco
        (id, estabelecimento_id, nome, valor_base, minutos_base, faixas_intermediarias, franquia_minutos, valor_bloco, minutos_por_bloco, ativo)
      VALUES (?, ?, 'Padrão', 25, 30, '[]', 60, 5, 15, 1)
    `).run(randomUUID(), id)
  }
}

function deduplicatePricingConfigs(db: Database.Database): void {
  // For each establishment, keep the most recently created active config and deactivate the rest
  const active = db.prepare(
    'SELECT id, estabelecimento_id FROM configuracoes_preco WHERE ativo = 1 ORDER BY criado_em DESC'
  ).all() as { id: string; estabelecimento_id: string }[]

  const seen = new Set<string>()
  const toDeactivate: string[] = []
  for (const row of active) {
    if (seen.has(row.estabelecimento_id)) {
      toDeactivate.push(row.id)
    } else {
      seen.add(row.estabelecimento_id)
    }
  }

  if (toDeactivate.length > 0) {
    const stmt = db.prepare('UPDATE configuracoes_preco SET ativo = 0 WHERE id = ?')
    const run = db.transaction(() => { for (const id of toDeactivate) stmt.run(id) })
    run()
    console.log(`[DB] Deactivated ${toDeactivate.length} duplicate pricing config(s)`)
  }
}

function migrateVisitasColunas(db: Database.Database): void {
  const cols = new Set(
    (db.prepare('PRAGMA table_info(visitas)').all() as { name: string }[]).map(r => r.name)
  )
  if (!cols.has('ticket_numero')) db.exec('ALTER TABLE visitas ADD COLUMN ticket_numero INTEGER')
  if (!cols.has('forma_pagamento')) db.exec('ALTER TABLE visitas ADD COLUMN forma_pagamento TEXT')
  if (!cols.has('configuracao_preco_snapshot')) db.exec('ALTER TABLE visitas ADD COLUMN configuracao_preco_snapshot TEXT')
}

function ensureConfiguracoesSistema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes_sistema (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `)
  const defaults: [string, string][] = [
    ['estabelecimento_nome', 'PlayKids'],
    ['estabelecimento_telefone1', ''],
    ['estabelecimento_telefone2', ''],
    ['rodape_ticket', 'Agradecemos sua visita!'],
    ['printer_interface', 'tcp://192.168.1.100:9100'],
    // Dados do estabelecimento extras
    ['ticket_unidade', ''],
    // Impressora granular
    ['printer_type', 'network'],
    ['printer_ip', '192.168.1.100'],
    ['printer_port', '9100'],
    ['printer_usb_name', ''],
    // Personalização do ticket
    ['ticket_exibir_codigo', 'true'],
    ['ticket_exibir_entrada', 'true'],
    ['ticket_exibir_tabela', 'true'],
    ['ticket_rodape2', ''],
  ]
  const stmt = db.prepare('INSERT OR IGNORE INTO configuracoes_sistema (chave, valor) VALUES (?, ?)')
  for (const [k, v] of defaults) stmt.run(k, v)
}

function migrateFechamentosCaixaColunas(db: Database.Database): void {
  const cols = new Set(
    (db.prepare('PRAGMA table_info(fechamentos_caixa)').all() as { name: string }[]).map(r => r.name)
  )
  if (!cols.has('suprimento_inicial')) db.exec('ALTER TABLE fechamentos_caixa ADD COLUMN suprimento_inicial REAL DEFAULT 0')
  if (!cols.has('operador_nome')) db.exec('ALTER TABLE fechamentos_caixa ADD COLUMN operador_nome TEXT')
}

function migrateCriancasColunas(db: Database.Database): void {
  const cols = new Set(
    (db.prepare('PRAGMA table_info(criancas)').all() as { name: string }[]).map(r => r.name)
  )
  if (!cols.has('cpf')) db.exec('ALTER TABLE criancas ADD COLUMN cpf TEXT')
}

function migrateConfiguracoesPrecoColunas(db: Database.Database): void {
  const existingCols = new Set(
    (db.prepare(`PRAGMA table_info(configuracoes_preco)`).all() as { name: string }[]).map(r => r.name)
  )

  const novasColunas: [string, string][] = [
    ['valor_base',            'REAL NOT NULL DEFAULT 25'],
    ['minutos_base',          'INTEGER NOT NULL DEFAULT 30'],
    ['faixas_intermediarias', "TEXT NOT NULL DEFAULT '[]'"],
    ['franquia_minutos',      'INTEGER NOT NULL DEFAULT 60'],
    ['valor_bloco',           'REAL NOT NULL DEFAULT 5'],
    ['minutos_por_bloco',     'INTEGER NOT NULL DEFAULT 15']
  ]

  for (const [col, def] of novasColunas) {
    if (!existingCols.has(col)) {
      db.exec(`ALTER TABLE configuracoes_preco ADD COLUMN ${col} ${def}`)
    }
  }
}
