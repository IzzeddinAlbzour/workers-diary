const Database = require('better-sqlite3');
const crypto = require('crypto');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workers(
  id TEXT PRIMARY KEY, name TEXT, phone TEXT, job TEXT, defaultWage REAL
);
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY, name TEXT, location TEXT, start TEXT
);
CREATE TABLE IF NOT EXISTS logs(
  id TEXT PRIMARY KEY, workerId TEXT, projectId TEXT, date TEXT,
  hours REAL, wage REAL, type TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS payments(
  id TEXT PRIMARY KEY, workerId TEXT, date TEXT, amount REAL, note TEXT
);
CREATE TABLE IF NOT EXISTS projectPayments(
  id TEXT PRIMARY KEY, projectId TEXT, date TEXT, amount REAL, note TEXT
);
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, name TEXT UNIQUE, salt TEXT, passHash TEXT,
  isAdmin INTEGER DEFAULT 0, perms TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`;

const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');

function open(file) {
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.exec(SCHEMA);
  // v1.2 migration: extra worker columns on DBs created before them
  const cols = d.prepare('PRAGMA table_info(workers)').all().map(c => c.name);
  for (const c of ['idNumber', 'bankName', 'bankAccount', 'idPhoto', 'permitPhoto'])
    if (!cols.includes(c)) d.exec(`ALTER TABLE workers ADD COLUMN ${c} TEXT DEFAULT ''`);

  const api = {
    getAll() {
      return {
        workers: d.prepare('SELECT * FROM workers').all(),
        projects: d.prepare('SELECT * FROM projects').all(),
        logs: d.prepare('SELECT * FROM logs').all(),
        payments: d.prepare('SELECT * FROM payments').all(),
        projectPayments: d.prepare('SELECT * FROM projectPayments').all()
      };
    },
    addWorker(w) {
      d.prepare('INSERT INTO workers(id,name,phone,job,defaultWage,idNumber,bankName,bankAccount,idPhoto,permitPhoto) VALUES (@id,@name,@phone,@job,@defaultWage,@idNumber,@bankName,@bankAccount,@idPhoto,@permitPhoto)')
        .run({ phone: '', job: '', defaultWage: 0, idNumber: '', bankName: '', bankAccount: '', idPhoto: '', permitPhoto: '', ...w });
    },
    addProject(p) {
      d.prepare('INSERT INTO projects(id,name,location,start) VALUES (@id,@name,@location,@start)')
        .run({ location: '', start: '', ...p });
    },
    addLog(l) {
      d.prepare('INSERT INTO logs(id,workerId,projectId,date,hours,wage,type,note) VALUES (@id,@workerId,@projectId,@date,@hours,@wage,@type,@note)')
        .run({ projectId: '', date: '', hours: 0, wage: 0, type: '', note: '', ...l });
    },
    addPayment(p) {
      d.prepare('INSERT INTO payments(id,workerId,date,amount,note) VALUES (@id,@workerId,@date,@amount,@note)')
        .run({ date: '', amount: 0, note: '', ...p });
    },
    addProjectPayment(p) {
      d.prepare('INSERT INTO projectPayments(id,projectId,date,amount,note) VALUES (@id,@projectId,@date,@amount,@note)')
        .run({ date: '', amount: 0, note: '', ...p });
    },
    updateProjectPayment(p) {
      d.prepare('UPDATE projectPayments SET projectId=@projectId, date=@date, amount=@amount, note=@note WHERE id=@id').run(p);
    },
    deleteProjectPayment(id) { d.prepare('DELETE FROM projectPayments WHERE id=?').run(id); },
    updateWorker(w) {
      d.prepare('UPDATE workers SET name=@name, phone=@phone, job=@job, defaultWage=@defaultWage, idNumber=@idNumber, bankName=@bankName, bankAccount=@bankAccount, idPhoto=@idPhoto, permitPhoto=@permitPhoto WHERE id=@id')
        .run({ idNumber: '', bankName: '', bankAccount: '', idPhoto: '', permitPhoto: '', ...w });
    },
    updateProject(p) {
      d.prepare('UPDATE projects SET name=@name, location=@location, start=@start WHERE id=@id').run(p);
    },
    updateLog(l) {
      d.prepare('UPDATE logs SET workerId=@workerId, projectId=@projectId, date=@date, hours=@hours, wage=@wage, type=@type, note=@note WHERE id=@id').run(l);
    },
    updatePayment(p) {
      d.prepare('UPDATE payments SET workerId=@workerId, date=@date, amount=@amount, note=@note WHERE id=@id').run(p);
    },
    deleteWorker(id) {
      // cascade: a worker's logs and payments are meaningless without the worker
      d.transaction(() => {
        d.prepare('DELETE FROM logs WHERE workerId=?').run(id);
        d.prepare('DELETE FROM payments WHERE workerId=?').run(id);
        d.prepare('DELETE FROM workers WHERE id=?').run(id);
      })();
    },
    deleteProject(id) {
      // logs keep their wages; projectName() falls back to "غير محدد"
      d.transaction(() => {
        d.prepare('DELETE FROM projectPayments WHERE projectId=?').run(id);
        d.prepare('DELETE FROM projects WHERE id=?').run(id);
      })();
    },
    deleteLog(id) { d.prepare('DELETE FROM logs WHERE id=?').run(id); },
    deletePayment(id) { d.prepare('DELETE FROM payments WHERE id=?').run(id); },
    resetAll() {
      d.transaction(() => {
        for (const t of ['workers', 'projects', 'logs', 'payments', 'projectPayments']) d.exec(`DELETE FROM ${t}`);
      })();
    },
    importAll(data) {
      d.transaction(() => {
        api.resetAll();
        for (const w of data.workers || []) api.addWorker(w);
        for (const p of data.projects || []) api.addProject(p);
        for (const l of data.logs || []) api.addLog(l);
        for (const p of data.payments || []) api.addPayment(p);
        for (const p of data.projectPayments || []) api.addProjectPayment(p);
      })();
    },
    // ---- users / auth (same-device trust model; hashes stop casual snooping) ----
    userCount() { return d.prepare('SELECT COUNT(*) c FROM users').get().c; },
    listUsers() {
      return d.prepare('SELECT id,name,isAdmin,perms FROM users').all()
        .map(u => ({ ...u, isAdmin: !!u.isAdmin, perms: JSON.parse(u.perms || '{}') }));
    },
    addUser({ id, name, pass, isAdmin = false, perms = {} }) {
      const salt = crypto.randomBytes(16).toString('hex');
      d.prepare('INSERT INTO users(id,name,salt,passHash,isAdmin,perms) VALUES (?,?,?,?,?,?)')
        .run(id, String(name).trim(), salt, hashPass(pass, salt), isAdmin ? 1 : 0, JSON.stringify(perms));
    },
    updateUser({ id, name, pass, isAdmin, perms }) {
      const u = d.prepare('SELECT * FROM users WHERE id=?').get(id);
      if (!u) return;
      const salt = pass ? crypto.randomBytes(16).toString('hex') : u.salt;
      d.prepare('UPDATE users SET name=?, salt=?, passHash=?, isAdmin=?, perms=? WHERE id=?')
        .run(String(name ?? u.name).trim(), salt, pass ? hashPass(pass, salt) : u.passHash,
             (isAdmin ?? !!u.isAdmin) ? 1 : 0, JSON.stringify(perms ?? JSON.parse(u.perms || '{}')), id);
    },
    deleteUser(id) {
      const u = d.prepare('SELECT isAdmin FROM users WHERE id=?').get(id);
      if (u && u.isAdmin && d.prepare('SELECT COUNT(*) c FROM users WHERE isAdmin=1').get().c <= 1)
        throw new Error('last-admin');
      d.prepare('DELETE FROM users WHERE id=?').run(id);
    },
    login(name, pass) {
      const u = d.prepare('SELECT * FROM users WHERE name=?').get(String(name).trim());
      if (!u || hashPass(pass, u.salt) !== u.passHash) return null;
      return { id: u.id, name: u.name, isAdmin: !!u.isAdmin, perms: JSON.parse(u.perms || '{}') };
    },
    getSetting(key, dflt = null) {
      const r = d.prepare('SELECT value FROM settings WHERE key=?').get(key);
      return r ? JSON.parse(r.value) : dflt;
    },
    setSetting(key, value) {
      d.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        .run(key, JSON.stringify(value));
    },
    close() { d.close(); }
  };
  return api;
}

module.exports = { open };
