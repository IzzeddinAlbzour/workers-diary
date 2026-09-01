const assert = require('assert');
const { ym, monthLabel, monthRange, stepMonth, monthsOf, groupByMonth, carryOver } = require('./month');

// ---- month key ----
assert.strictEqual(ym('2026-07-13'), '2026-07', 'ym takes the first 7 chars');
assert.strictEqual(ym(''), '', 'empty date has no month');
assert.strictEqual(ym(undefined), '', 'missing date has no month');
assert.strictEqual(ym('bogus'), '', 'unparseable date has no month');

// ---- label ----
assert.strictEqual(monthLabel('2026-07'), 'شهر 7 / 2026 (يوليو)', 'label drops the leading zero');
assert.strictEqual(monthLabel('2026-12'), 'شهر 12 / 2026 (ديسمبر)', 'december labels');
assert.strictEqual(monthLabel(''), 'بدون تاريخ', 'logs with no date get their own bucket label');
assert.strictEqual(monthLabel('2026-07', true), 'شهر 7 / 2026', 'short label drops the month name, for chips');
assert.strictEqual(monthLabel('', true), 'بدون تاريخ', 'short label of an undated bucket');

// ---- range: the month filter writes these into _rFrom/_rTo ----
assert.deepStrictEqual(monthRange('2026-07'), { from: '2026-07-01', to: '2026-07-31' }, '31-day month');
assert.deepStrictEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' }, 'ordinary february');
assert.deepStrictEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' }, 'leap february');

// ---- stepping across year boundaries ----
assert.strictEqual(stepMonth('2026-01', -1), '2025-12', 'step back over new year');
assert.strictEqual(stepMonth('2026-12', 1), '2027-01', 'step forward over new year');
assert.strictEqual(stepMonth('2026-07', 0), '2026-07', 'no step is identity');

// ---- grouping ----
const logs = [
  { date: '2026-07-01', wage: 400, profit: 50, hours: 8 },
  { date: '2026-08-01', wage: 450, profit: 50, hours: 8 },
  { date: '2026-07-02', wage: 400, profit: 50, hours: 8 },
  { date: '2026-06-30', wage: 300, profit: 0, hours: 6 }
];
assert.deepStrictEqual(monthsOf(logs), ['2026-08', '2026-07', '2026-06'], 'months newest first');
assert.deepStrictEqual(monthsOf(logs, false), ['2026-06', '2026-07', '2026-08'], 'months oldest first for print');
const grouped = groupByMonth(logs);
assert.deepStrictEqual(grouped.map(g => g[0]), ['2026-08', '2026-07', '2026-06'], 'groups newest first');
assert.strictEqual(grouped.find(g => g[0] === '2026-07')[1].length, 2, 'july holds both july rows');
assert.deepStrictEqual(
  groupByMonth(logs, false).map(g => g[0]), ['2026-06', '2026-07', '2026-08'], 'ascending groups for print');
assert.deepStrictEqual(groupByMonth([]), [], 'no rows, no groups');

// ---- carry-over: the money shown on a month payslip ----
const pays = [
  { date: '2026-06-30', amount: 100 },
  { date: '2026-07-15', amount: 500 },
  { date: '2026-07-20', amount: 300 }
];
const july = carryOver(logs, pays, '2026-07');
assert.strictEqual(july.prev, 200, 'prev = 300 earned before july - 100 paid before july');
assert.strictEqual(july.earned, 800, 'july wages');
assert.strictEqual(july.paid, 800, 'july payments');
assert.strictEqual(july.days, 2, 'july day count');
assert.strictEqual(july.hours, 16, 'july hours');
assert.strictEqual(july.profit, 100, 'july profit (owner-only figure)');
assert.strictEqual(july.balance, 200, 'balance = prev + earned - paid, i.e. the real running balance');

const june = carryOver(logs, pays, '2026-06');
assert.strictEqual(june.prev, 0, 'first month has nothing carried in');
assert.strictEqual(june.balance, 200, 'june: 300 earned - 100 paid');

// a month with a payment but no logged days still settles correctly
const sept = carryOver(logs, [...pays, { date: '2026-09-05', amount: 250 }], '2026-09');
assert.strictEqual(sept.days, 0, 'no work days in september');
assert.strictEqual(sept.earned, 0, 'no wages in september');
assert.strictEqual(sept.paid, 250, 'september payment counted');
assert.strictEqual(sept.prev, 650, 'carried in: 1550 earned - 900 paid, all of it before september');
assert.strictEqual(sept.balance, 400, 'paying 250 against a 650 balance leaves 400');

// undated rows never leak into a real month, and never poison the carry-over
const withUndated = carryOver([...logs, { date: '', wage: 999 }], pays, '2026-07');
assert.deepStrictEqual(
  { prev: withUndated.prev, earned: withUndated.earned, balance: withUndated.balance },
  { prev: july.prev, earned: july.earned, balance: july.balance },
  'a log with no date is excluded from every month bucket');

// float safety: 0.1 + 0.2 must not print as 0.30000000000000004
const cents = carryOver([{ date: '2026-07-01', wage: 0.1 }, { date: '2026-07-02', wage: 0.2 }], [], '2026-07');
assert.strictEqual(cents.earned, 0.3, 'money rounded to 2 decimals');

console.log('ALL MONTH TESTS PASSED');
