const Database = require('better-sqlite3');

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
`;

function open(file) {
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.exec(SCHEMA);

  const api = {
    getAll() {
      return {
        workers: d.prepare('SELECT * FROM workers').all(),
        projects: d.prepare('SELECT * FROM projects').all(),
        logs: d.prepare('SELECT * FROM logs').all(),
        payments: d.prepare('SELECT * FROM payments').all()
      };
    },
    addWorker(w) {
      d.prepare('INSERT INTO workers(id,name,phone,job,defaultWage) VALUES (@id,@name,@phone,@job,@defaultWage)')
        .run({ phone: '', job: '', defaultWage: 0, ...w });
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
    resetAll() {
      d.transaction(() => {
        for (const t of ['workers', 'projects', 'logs', 'payments']) d.exec(`DELETE FROM ${t}`);
      })();
    },
    importAll(data) {
      d.transaction(() => {
        api.resetAll();
        for (const w of data.workers || []) api.addWorker(w);
        for (const p of data.projects || []) api.addProject(p);
        for (const l of data.logs || []) api.addLog(l);
        for (const p of data.payments || []) api.addPayment(p);
      })();
    },
    close() { d.close(); }
  };
  return api;
}

module.exports = { open };
