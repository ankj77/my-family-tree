var assert = require('assert');
var links = require('../web/links.js');

var result = { found: true, steps: [{ id: 'bash', name: 'Bash' }, { id: 'mohan', name: 'Mohan' }],
  summary: { en: "daughter's husband's brother", hi: null } };
assert.strictEqual(links.sentence(result, 'bash'), "Mohan is your daughter's husband's brother.");
assert.strictEqual(links.sentence(result, 'amit'), "Mohan is Bash's daughter's husband's brother.");
var hi = { found: true, steps: [{ id: 'a', name: 'Amit' }, { id: 'b', name: 'Bash' }], summary: { en: "mother's father", hi: 'नाना जी' } };
assert.strictEqual(links.sentence(hi, 'a'), "Bash is your mother's father (नाना जी).");
assert.strictEqual(links.sentence({ found: false }, 'a'), 'No link found in the records.');
assert.strictEqual(links.sentence({ found: true, steps: [{ id: 'a' }] }, 'a'), "That's the same person.");

assert.strictEqual(links.query({ va: 'bakheta', vb: null }), '?a=bakheta');
assert.strictEqual(links.query({ va: null, vb: null }), '');
console.log('links_check ok');
