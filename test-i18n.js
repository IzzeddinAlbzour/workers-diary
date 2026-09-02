const assert = require('assert');
const { S, t } = require('./i18n');

const ARABIC = /[؀-ۿ]/;
const HEBREW = /[֐-׿]/;
const keys = Object.keys(S);

assert.ok(keys.length > 100, 'dictionary has real coverage, not a stub');

for (const k of keys) {
  const row = S[k];
  assert.ok(typeof row.ar === 'string' && row.ar.trim(), `${k}: missing/empty Arabic value`);
  assert.ok(typeof row.he === 'string' && row.he.trim(), `${k}: missing/empty Hebrew value`);
  // catches exactly the two bugs found while building this dictionary: a Hebrew value that still
  // has Arabic letters in it (copy-paste leftover), and vice versa
  assert.ok(!HEBREW.test(row.ar), `${k}: Arabic value contains Hebrew characters: "${row.ar}"`);
  assert.ok(!ARABIC.test(row.he), `${k}: Hebrew value contains Arabic characters: "${row.he}"`);
  assert.notStrictEqual(row.ar, row.he, `${k}: ar and he are identical — likely an untranslated placeholder`);
}

// t()
assert.strictEqual(t('save', 'ar'), 'حفظ');
assert.strictEqual(t('save', 'he'), 'שמירה');
assert.strictEqual(t('save', 'fr'), 'حفظ', 'unknown language falls back to Arabic');
assert.strictEqual(t('doesNotExist', 'he'), 'doesNotExist', 'missing key returns the key itself, never throws');

// placeholder-bearing strings keep their {token} markers intact in both languages
const withPlaceholders = keys.filter(k => /\{[a-z]+\}/.test(S[k].ar));
assert.ok(withPlaceholders.length >= 5, 'at least the confirm-dialog templates use placeholders');
for (const k of withPlaceholders) {
  const arTokens = [...S[k].ar.matchAll(/\{([a-z]+)\}/g)].map(m => m[1]).sort();
  const heTokens = [...S[k].he.matchAll(/\{([a-z]+)\}/g)].map(m => m[1]).sort();
  assert.deepStrictEqual(heTokens, arTokens, `${k}: Hebrew template is missing/renaming a placeholder`);
}

console.log('ALL I18N TESTS PASSED');
