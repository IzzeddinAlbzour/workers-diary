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
assert.deepStrictEqual(all.workers[0], w);
assert.deepStrictEqual(all.projects[0], p);
assert.deepStrictEqual(all.logs[0], l1);
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
assert.deepStrictEqual(db.getAll().workers[0], w2, 'updateWorker persists all fields');
const l1b = { ...l1, wage: 160, hours: 9 };
db.updateLog(l1b);
assert.deepStrictEqual(db.getAll().logs.find(x => x.id === l1.id), l1b, 'updateLog persists');

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

db.close();
console.log('ALL TESTS PASSED');
