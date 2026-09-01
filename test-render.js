/* Runs app.html's real page code against a stub DOM. Catches the failure mode that unit-testing
   month.js alone cannot: a renderer that throws or drops a month band. Also re-asserts the v1.5
   privacy rule (a worker's printed statement never shows the owner's profit) under the new
   month-per-page layout. No test framework, no jsdom — node's own vm module. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// ---- stub DOM ----
const nodes = {};
const el = () => ({
  innerHTML: '', outerHTML: '', value: '', textContent: '', style: {}, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  focus() {}, remove() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
  querySelector: () => el(), querySelectorAll: () => [], closest: () => el()
});
let lastCreated = null;
const document = {
  querySelector: s => nodes[s] || (nodes[s] = el()),
  querySelectorAll: () => [],
  createElement: () => (lastCreated = el()),
  addEventListener() {},
  body: { appendChild() {}, classList: { add() {}, remove() {} } }
};

const ctx = vm.createContext({
  console, document, setTimeout, clearTimeout, crypto,
  window: { api: {}, print() {}, addEventListener() {}, removeEventListener() {} },
  navigator: { clipboard: { writeText() {} } }
});
vm.runInContext(fs.readFileSync(__dirname + '/month.js', 'utf8'), ctx);

const html = fs.readFileSync(__dirname + '/app.html', 'utf8');
// the page must actually pull month.js in, and the packaged build must ship it
assert.ok(/<script src="month\.js"><\/script>/.test(html), 'app.html loads month.js');
assert.ok(require('./package.json').build.files.includes('month.js'), 'month.js is packaged into the app');
const script = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html)[1].replace(/\bboot\(\);\s*$/, '');
vm.runInContext(script, ctx);
const run = code => vm.runInContext(code, ctx);

// ---- fixture: three months, two projects, one payment per month, a distinctive profit ----
const PROFIT = 7777; // must never appear on a worker-facing print
run(`
CU={id:'u',name:'مدير',isAdmin:true,perms:{}};
db={
 workers:[{id:'w1',name:'أحمد',job:'سباك',phone:'0599',defaultWage:400,defaultProfit:0,idNumber:'',bankName:'',bankAccount:'',idPhoto:'',permitPhoto:''}],
 projects:[{id:'p1',name:'بيت شيمش',location:'',start:'2026-06-01',done:0},{id:'p2',name:'رام الله',location:'',start:'2026-08-01',done:0}],
 logs:[
  {id:'l1',workerId:'w1',projectId:'p1',date:'2026-06-30',hours:6,wage:300,profit:${PROFIT},type:'سباكة',note:''},
  {id:'l2',workerId:'w1',projectId:'p1',date:'2026-07-01',hours:8,wage:400,profit:${PROFIT},type:'سباكة',note:''},
  {id:'l3',workerId:'w1',projectId:'p2',date:'2026-07-02',hours:8,wage:400,profit:${PROFIT},type:'جبصين',note:''},
  {id:'l4',workerId:'w1',projectId:'p2',date:'2026-08-01',hours:8,wage:450,profit:${PROFIT},type:'كهرباء',note:''}
 ],
 payments:[
  {id:'y1',workerId:'w1',date:'2026-06-30',amount:100,note:'سلفة'},
  {id:'y2',workerId:'w1',date:'2026-07-15',amount:500,note:'دفعة'}
 ],
 projectPayments:[{id:'q1',projectId:'p1',date:'2026-07-20',amount:2000,note:'دفعة أولى'}],
 expenses:[{id:'x1',partner:'me',projectId:'',date:'2026-07-05',amount:120,note:'بنزين'},
           {id:'x2',partner:'brother',projectId:'',date:'2026-08-05',amount:80,note:'أدوات'}]
};
page='reports';
`);

const main = () => document.querySelector('#main').innerHTML;

// ---- every page still renders ----
for (const p of ['home', 'workers', 'projects', 'reports', 'accounts', 'expenses']) {
  run(`${p}()`);
  assert.ok(main().length > 100, `${p}() renders markup`);
}

// ---- reports: all months -> one band per month, each with its own subtotal ----
run('reports()');
let out = main();
for (const m of ['شهر 6 / 2026', 'شهر 7 / 2026', 'شهر 8 / 2026'])
  assert.ok(out.includes(m), `report bands include ${m}`);
assert.strictEqual((out.match(/class="mhead"/g) || []).length, 3, 'three month header rows');
assert.strictEqual((out.match(/class="msub"/g) || []).length, 3, 'three month subtotal rows');
assert.ok(out.includes('كل الشهور'), 'the all-months chip is offered');

// ---- reports: one month selected -> only that month, no banding, carry-over shown ----
run(`_rWorker='w1';setReportMonth('2026-07')`);
out = main();
assert.ok(out.includes('معروض شهر واحد فقط'), 'single-month notice');
assert.ok(!out.includes('class="mhead"'), 'no month bands when a single month is selected');
assert.ok(out.includes('2026-07-01') && out.includes('2026-07-02'), 'july rows present');
assert.ok(!out.includes('2026-06-30') && !out.includes('2026-08-01'), 'other months filtered out');
assert.ok(out.includes('رصيد سابق (قبل هذا الشهر)'), 'carry-over line shown for a single worker+month');
assert.ok(out.includes('الرصيد الحالي'), 'running balance shown');

// month filter drives the same from/to the report already used
run(`setReportMonth('2026-02')`);
assert.ok(main().includes('لا توجد نتائج مطابقة'), 'a month with no logs yields no rows');
run(`_rWorker='';setReportMonth('')`);
assert.ok(main().includes('class="mhead"'), 'clearing the month restores month banding');

// ---- worker profile: diaries collapsed per month, newest open ----
run(`workerDetail('w1')`);
let sheet = lastCreated.innerHTML;
assert.strictEqual((sheet.match(/class="msec"/g) || []).length, 3, 'one collapsible section per month');
assert.strictEqual((sheet.match(/<details class="msec" open>/g) || []).length, 1, 'only the newest month starts open');
assert.ok(sheet.indexOf('شهر 8 / 2026') < sheet.indexOf('شهر 6 / 2026'), 'newest month first');
assert.ok(sheet.includes(`printWorkerFull('w1','2026-07')`), 'each month offers its own payslip print');

// ---- worker payslip: month outer, project as a column, carry-over, never the owner's profit ----
let printed = '';
ctx.printPreview = (t, h) => { printed = h; };
/* money() renders Arabic-Indic digits, so searching for "7777" would match nothing anywhere and
   every privacy assertion would pass vacuously. Ask the app itself how it would print the number. */
const profitNeedle = run(`money(${PROFIT})`).replace(/<[^>]*>/g, '').trim();
assert.ok(profitNeedle.length > 3, 'profit needle is a real rendered amount');

run(`printWorkerFull('w1','2026-07')`);
assert.ok(printed.includes('شهر 7 / 2026'), 'single-month payslip is titled with the month');
assert.ok(!printed.includes('شهر 8 / 2026'), 'a single-month payslip carries no other month');
assert.ok(printed.includes('<th>المشروع</th>'), 'project is a column, not the outer grouping');
assert.ok(printed.includes('بيت شيمش') && printed.includes('رام الله'), 'both projects appear as rows inside the month');
assert.ok(printed.includes('رصيد سابق (قبل هذا الشهر)'), 'payslip carries the previous balance in');
assert.ok(printed.includes('توقيع العامل'), 'payslip is signable');
assert.ok(!printed.includes(profitNeedle), 'PRIVACY: the owner profit never reaches a worker-facing print');
assert.ok(!printed.includes('ربحك') && !printed.includes('المستحق من الشركة'), 'PRIVACY: no owner-only labels');

run(`printWorkerFull('w1')`);
assert.strictEqual((printed.match(/class="month-block"/g) || []).length, 3, 'full statement = one block per month');
assert.strictEqual((printed.match(/توقيع العامل/g) || []).length, 3, 'every month page is separately signable');
assert.ok(!printed.includes(profitNeedle), 'PRIVACY: profit absent from the full statement too');

// carry-over arithmetic as it reaches paper: july = 200 carried in, 800 earned, 500 paid -> 500
const july = ctx.carryOver(
  vm.runInContext('db.logs', ctx), vm.runInContext('db.payments', ctx), '2026-07');
assert.deepStrictEqual(
  { prev: july.prev, earned: july.earned, paid: july.paid, balance: july.balance },
  { prev: 200, earned: 800, paid: 500, balance: 500 }, 'payslip figures');

// ---- company/project print: month banded, billed amounts only ----
run(`printProject('p1')`);
assert.ok(printed.includes('شهر 6 / 2026') && printed.includes('شهر 7 / 2026'), 'project report bands by month');
assert.ok(printed.includes('class="msub"'), 'each month gets a subtotal');
assert.ok(!printed.includes('أجر العامل'), 'company sheet never labels the worker wage');

// ---- internal report print follows the same month rules ----
run(`_rWorker='';_rProject='';setReportMonth('');printReportView()`);
assert.strictEqual((printed.match(/class="mhead"/g) || []).length, 3, 'printed report bands all three months');
assert.ok(printed.indexOf('2026-06-30') < printed.indexOf('2026-08-01'), 'printed report runs oldest to newest');
// control for the privacy assertions above: the profit IS visible on the owner's own report, so
// its absence from the worker prints is a real result and not a string that never renders anywhere
assert.ok(printed.includes(profitNeedle), 'owner-facing report does show the profit');
assert.ok(printed.includes('ربحك'), 'owner-facing report labels the profit column');

// ---- expenses: grouped per month, and the settlement follows the picked month ----
run(`setExpenseMonth('')`);
out = main();
assert.strictEqual((out.match(/class="msec"/g) || []).length, 2, 'expenses grouped into two months');
run(`setExpenseMonth('2026-07')`);
out = main();
assert.ok(out.includes('بنزين') && !out.includes('أدوات'), 'only the picked month\'s expenses');
assert.ok(out.includes('على أخيك تحويل'), 'settlement recomputed for that month alone');

console.log('ALL RENDER TESTS PASSED');
