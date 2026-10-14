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

assert.deepStrictEqual(links.parsePick('v:kakroi'), { kind: 'v', id: 'kakroi' });
assert.deepStrictEqual(links.parsePick('p:ankur'), { kind: 'p', id: 'ankur' });
assert.deepStrictEqual(links.parsePick('ankur'), { kind: 'p', id: 'ankur' });
assert.strictEqual(links.parsePick(null), null);
assert.strictEqual(links.query({ a: { kind: 'p', id: 'ankur' }, b: { kind: 'v', id: 'kakroi' } }), '?a=p%3Aankur&b=v%3Akakroi');
assert.strictEqual(links.query({ a: null, b: null }), '');
var found = links.matches([{ id: 'k', name: 'Kakroi Lal' }, { id: 'r', name: 'Ram' }], [{ id: 'kakroi', name: 'Kakroi' }], 'kak');
assert.deepStrictEqual(found.map(function (m) { return m.kind + ':' + m.item.id; }), ['v:kakroi', 'p:k']);
assert.deepStrictEqual(links.matches([], [], ' '), []);
assert.strictEqual(links.who({ relation: 'son of Vijay', village: 'Bakheta' }), 'son of Vijay · Bakheta');
console.log('links_check ok');
