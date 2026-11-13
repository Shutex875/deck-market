const { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, rmdirSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');
const { fileURLToPath } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const dotenv = require('dotenv');

const backend = resolve(__dirname, '..');
dotenv.config({ path: join(backend, '.env'), quiet: true });

function databasePath() {
  const url = process.env.DATABASE_URL ?? 'file:../data/bastdecks.db';
  if (!url.startsWith('file:') || url.includes('?') || url.includes('#') || url === 'file::memory:') {
    throw new Error('DATABASE_URL must point to a SQLite file.');
  }
  return url.startsWith('file://') ? fileURLToPath(url) : resolve(backend, 'prisma', url.slice(5));
}

function checkDatabase(db) {
  const checks = db.prepare('PRAGMA integrity_check').all();
  if (checks.length !== 1 || checks[0].integrity_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').get() ||
      !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Player'").get()) {
    throw new Error('SQLite integrity or BastDecks schema check failed.');
  }
}

function snapshot(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  const temp = mkdtempSync(join(dirname(destination), '.snapshot-'));
  const staged = join(temp, 'snapshot.db');
  try {
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      db.exec('PRAGMA busy_timeout = 5000');
      db.prepare('VACUUM INTO ?').run(staged);
    } finally {
      db.close();
    }
    const copy = new DatabaseSync(staged, { readOnly: true });
    try {
      checkDatabase(copy);
    } finally {
      copy.close();
    }
    copyFileSync(staged, destination, constants.COPYFILE_EXCL);
  } finally {
    if (existsSync(staged)) rmSync(staged);
    rmdirSync(temp);
  }
}

try {
  const [command, source, destination, extra] = process.argv.slice(2);
  if (command === 'backup' && !destination && !extra) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = source ? resolve(source) : join(dirname(databasePath()), 'backups', `bastdecks-${stamp}.db`);
    snapshot(databasePath(), output);
    console.log(output);
  } else if (command === 'restore' && source && destination && !extra) {
    const output = resolve(destination);
    snapshot(resolve(source), output);
    console.log(output);
  } else {
    throw new Error('Usage: db:backup -- [destination] | db:restore -- <backup> <new-database>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
