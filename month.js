/* Month helpers — logs/payments store `date` as ISO "YYYY-MM-DD", so the month
   key is just the first 7 chars. Kept in its own file so the carry-over money
   math can be asserted from node (test-month.js) without booting Electron. */
(function (root) {
  const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const MONTH_WORD = { ar: 'شهر', he: 'חודש' };
  const NO_DATE = { ar: 'بدون تاريخ', he: 'ללא תאריך' };

  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

  /** "2026-07-13" -> "2026-07"; anything unparseable -> "" */
  const ym = d => {
    const s = String(d || '');
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : '';
  };

  /** "2026-07" -> "شهر 7 / 2026 (يوليو)" (ar) or "חודש 7 / 2026 (יולי)" (he); short drops the name. "" -> "no date" in that language */
  const monthLabel = (k, short, lang = 'ar') => {
    const names = lang === 'he' ? HE_MONTHS : AR_MONTHS;
    const word = MONTH_WORD[lang] || MONTH_WORD.ar;
    if (!k) return (lang === 'he' ? NO_DATE.he : NO_DATE.ar);
    const y = k.slice(0, 4), m = Number(k.slice(5, 7));
    return short ? `${word} ${m} / ${y}` : `${word} ${m} / ${y} (${names[m - 1] || ''})`;
  };

  /** "2026-07" -> {from:"2026-07-01", to:"2026-07-31"} — `to` via day 0 of next month */
  const monthRange = k => {
    const y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7));
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${k}-01`, to: `${k}-${String(last).padStart(2, '0')}` };
  };

  /** shift a month key by n months: ("2026-01", -1) -> "2025-12" */
  const stepMonth = (k, n) => {
    const y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7));
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };

  /** distinct month keys present in rows, newest first by default */
  const monthsOf = (rows, desc = true) => {
    const keys = [...new Set((rows || []).map(r => ym(r.date)))];
    keys.sort((a, b) => desc ? b.localeCompare(a) : a.localeCompare(b));
    return keys;
  };

  /** [[monthKey, rows], ...] — group order by key, row order preserved from input */
  const groupByMonth = (rows, desc = true) => {
    const map = new Map();
    for (const r of rows || []) {
      const k = ym(r.date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return [...map.entries()].sort((a, b) => desc ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]));
  };

  /**
   * Month statement for one worker.
   * prev    = everything owed before this month minus everything paid before it
   * earned  = wages logged inside the month
   * paid    = payments/advances dated inside the month
   * balance = prev + earned - paid  (his true running balance at month end)
   */
  const carryOver = (logs, payments, monthKey) => {
    let prevEarned = 0, prevPaid = 0, earned = 0, paid = 0, profit = 0, hours = 0, days = 0;
    for (const l of logs || []) {
      const k = ym(l.date);
      if (k && k < monthKey) { prevEarned += Number(l.wage || 0); continue; }
      if (k === monthKey) {
        earned += Number(l.wage || 0);
        profit += Number(l.profit || 0);
        hours += Number(l.hours || 0);
        days++;
      }
    }
    for (const p of payments || []) {
      const k = ym(p.date);
      if (k && k < monthKey) { prevPaid += Number(p.amount || 0); continue; }
      if (k === monthKey) paid += Number(p.amount || 0);
    }
    const prev = r2(prevEarned - prevPaid);
    return {
      prev, earned: r2(earned), paid: r2(paid), profit: r2(profit),
      hours: r2(hours), days, balance: r2(prev + earned - paid)
    };
  };

  const M = { ym, monthLabel, monthRange, stepMonth, monthsOf, groupByMonth, carryOver };
  if (typeof module === 'object' && module.exports) module.exports = M;
  else Object.assign(root, M);
})(typeof globalThis !== 'undefined' ? globalThis : this);
