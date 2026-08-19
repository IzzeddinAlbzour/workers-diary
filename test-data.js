const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { open } = require('./db');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-test-'));
const db = open(path.join(dir, 'test.db'));

const uuid = require('crypto').randomUUID;
const w = { id: uuid(), name: 'أحمد', phone: '0599', job: 'سباك', defaultWage: 150 };
const p = { id: uuid(), name: 'فيلا', location: 'رام الله', start: '2026-08-01' };
db.addWorker(w);
db.addProject(p);
const l1 = { id: uuid(), workerId: w.id, projectId: p.id, date: '2026-08-10', hours: 8, wage: 150, type: 'سباكة', note: '' };
const l2 = { id: uuid(), workerId: w.id, projectId: p.id, date: '2026-08-11', hours: 4.5, wage: 80, type: '', note: 'نص يوم' };
db.addLog(l1);
db.addLog(l2);
const pay = { id: uuid(), workerId: w.id, date: '2026-08-10', amount: 50, note: 'سلفة من اليومية' };
db.addPayment(pay);

let all = db.getAll();
const earned = all.logs.reduce((a, l) => a + l.wage, 0);
const paid = all.payments.reduce((a, p) => a + p.amount, 0);
assert.strictEqual(earned, 230, 'earned = sum of log.wage');
assert.strictEqual(paid, 50, 'paid = sum of payment.amount');
assert.strictEqual(earned - paid, 180, 'global balance');

// per-worker
const wEarned = all.logs.filter(l => l.workerId === w.id).reduce((a, l) => a + l.wage, 0);
const wPaid = all.payments.filter(x => x.workerId === w.id).reduce((a, x) => a + x.amount, 0);
assert.strictEqual(wEarned - wPaid, 180, 'per-worker balance');

// field names round-trip identical to JSON shape
assert.deepStrictEqual(all.workers[0], { ...w, defaultProfit: 0, idNumber: '', bankName: '', bankAccount: '', idPhoto: '', permitPhoto: '' });
assert.deepStrictEqual(all.projects[0], { ...p, done: 0 });
assert.deepStrictEqual(all.logs[0], { ...l1, profit: 0 });
assert.deepStrictEqual(all.payments[0], pay);

// export -> reset -> import restores identical
const snapshot = JSON.parse(JSON.stringify(all));
db.resetAll();
all = db.getAll();
assert.strictEqual(all.workers.length + all.projects.length + all.logs.length + all.payments.length, 0, 'reset clears all four tables');
db.importAll(snapshot);
assert.deepStrictEqual(db.getAll(), snapshot, 'export -> reset -> import restores identical data');

// update round-trip
const w2 = { ...w, name: 'أحمد محدث', defaultWage: 175 };
db.updateWorker(w2);
assert.deepStrictEqual(db.getAll().workers[0], { ...w2, defaultProfit: 0, idNumber: '', bankName: '', bankAccount: '', idPhoto: '', permitPhoto: '' }, 'updateWorker persists all fields');
const l1b = { ...l1, wage: 160, hours: 9 };
db.updateLog(l1b);
assert.deepStrictEqual(db.getAll().logs.find(x => x.id === l1.id), { ...l1b, profit: 0 }, 'updateLog persists');

// wage/profit split (v1.4): worker's daily wage vs. your cut vs. company bill
const wProfit = { id: uuid(), name: 'خالد', defaultWage: 100, defaultProfit: 20 };
db.addWorker(wProfit);
assert.strictEqual(db.getAll().workers.find(x => x.id === wProfit.id).defaultProfit, 20, 'defaultProfit persists');
const lProfit = { id: uuid(), workerId: wProfit.id, date: '2026-08-13', wage: 600, profit: 100 };
db.addLog(lProfit);
const savedLog = db.getAll().logs.find(x => x.id === lProfit.id);
assert.strictEqual(savedLog.wage, 600, 'log wage (worker pay) persists');
assert.strictEqual(savedLog.profit, 100, 'log profit (your cut) persists');
assert.strictEqual(savedLog.wage + savedLog.profit, 700, 'company bill = wage + profit');

// deleteLog / deletePayment single-row
db.deleteLog(l2.id);
assert.strictEqual(db.getAll().logs.length, 1, 'deleteLog removes one row');
db.deletePayment(pay.id);
assert.strictEqual(db.getAll().payments.length, 0, 'deletePayment removes row');

// deleteProject keeps logs (orphan projectId)
db.deleteProject(p.id);
let a2 = db.getAll();
assert.strictEqual(a2.projects.length, 0, 'project gone');
assert.strictEqual(a2.logs.length, 1, 'logs survive project delete');

// deleteWorker cascades logs+payments
db.addPayment({ id: uuid(), workerId: w.id, date: '2026-08-12', amount: 10, note: '' });
db.deleteWorker(w.id);
a2 = db.getAll();
assert.strictEqual(a2.workers.length + a2.logs.length + a2.payments.length, 0, 'worker delete cascades logs and payments');

// v1.2: worker extra fields round-trip
const w3 = { id: uuid(), name: 'سامي', phone: '', job: '', defaultWage: 100, idNumber: '401234567', bankName: 'بنك فلسطين', bankAccount: '123456', idPhoto: 'a.jpg', permitPhoto: 'b.jpg' };
db.addWorker(w3);
assert.deepStrictEqual(db.getAll().workers[0], { ...w3, defaultProfit: 0 }, 'worker extra fields persist');
db.updateWorker({ ...w3, idNumber: '999', bankName: 'العربي' });
assert.strictEqual(db.getAll().workers[0].idNumber, '999', 'updateWorker persists idNumber');

// v1.2: project payments CRUD + cascade + import round-trip
const p3 = { id: uuid(), name: 'برج', location: '', start: '2026-08-01' };
db.addProject(p3);
const pp = { id: uuid(), projectId: p3.id, date: '2026-08-11', amount: 5000, note: 'دفعة أولى' };
db.addProjectPayment(pp);
assert.deepStrictEqual(db.getAll().projectPayments[0], pp, 'projectPayment persists');
db.updateProjectPayment({ ...pp, amount: 6000 });
assert.strictEqual(db.getAll().projectPayments[0].amount, 6000, 'updateProjectPayment');
const snap2 = db.getAll();
db.resetAll();
assert.strictEqual(db.getAll().projectPayments.length, 0, 'reset clears projectPayments');
db.importAll(snap2);
assert.deepStrictEqual(db.getAll(), snap2, 'import restores projectPayments too');
db.deleteProject(p3.id);
assert.strictEqual(db.getAll().projectPayments.length, 0, 'project delete cascades its payments');

// migration: old-schema DB gains new columns on open
const Database = require('better-sqlite3');
const oldFile = path.join(dir, 'old.db');
const raw = new Database(oldFile);
raw.exec("CREATE TABLE workers(id TEXT PRIMARY KEY, name TEXT, phone TEXT, job TEXT, defaultWage REAL)");
raw.prepare("INSERT INTO workers VALUES ('x','قديم','','',90)").run();
raw.close();
const migrated = open(oldFile);
const mw = migrated.getAll().workers[0];
assert.strictEqual(mw.idNumber, '', 'migration adds idNumber');
assert.strictEqual(mw.name, 'قديم', 'migration keeps old data');
migrated.addProjectPayment({ id: uuid(), projectId: 'p', date: '2026-01-01', amount: 1, note: '' });
migrated.close();

// v1.3: users + auth
assert.strictEqual(db.userCount(), 0, 'no users initially');
const admin = { id: uuid(), name: 'المدير', pass: 'secret123', isAdmin: true, perms: {} };
db.addUser(admin);
assert.strictEqual(db.login('المدير', 'wrong'), null, 'wrong password rejected');
const logged = db.login('المدير', 'secret123');
assert.strictEqual(logged.isAdmin, true, 'admin login works');
const partner = { id: uuid(), name: 'شريك', pass: 'p1', isAdmin: false, perms: { logs: true, money: false } };
db.addUser(partner);
assert.deepStrictEqual(db.login('شريك', 'p1').perms, { logs: true, money: false }, 'perms round-trip');
db.updateUser({ id: partner.id, perms: { logs: true, money: true } });
assert.strictEqual(db.login('شريك', 'p1').perms.money, true, 'perms update, password kept');
db.updateUser({ id: partner.id, pass: 'p2' });
assert.strictEqual(db.login('شريك', 'p1'), null, 'old password dead after change');
assert.ok(db.login('شريك', 'p2'), 'new password works');
let threw = false;
try { db.deleteUser(admin.id); } catch { threw = true; }
assert.ok(threw, 'cannot delete last admin');
db.deleteUser(partner.id);
assert.strictEqual(db.userCount(), 1, 'partner deleted');

// settings round-trip
db.setSetting('backupMode', 'daily');
db.setSetting('backupKeep', 10);
assert.strictEqual(db.getSetting('backupMode'), 'daily', 'setting stored');
db.setSetting('backupMode', 'weekly');
assert.strictEqual(db.getSetting('backupMode'), 'weekly', 'setting upsert');
assert.strictEqual(db.getSetting('missing', 'dflt'), 'dflt', 'setting default');

// users/settings survive resetAll (accounts are not business data)
db.resetAll();
assert.strictEqual(db.userCount(), 1, 'users survive data reset');
assert.strictEqual(db.getSetting('backupMode'), 'weekly', 'settings survive data reset');

db.close();
console.log('ALL TESTS PASSED');
