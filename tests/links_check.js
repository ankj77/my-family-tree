var assert = require('assert');
var links = require('../web/links.js');

var steps = [
  { id: 'bash', name: 'Bash', rel: null },
  { id: 'rashmi', name: 'Rashmi', rel: 'daughter' },
  { id: 'jagdish', name: 'Jagdish', rel: 'husband' },
  { id: 'ram', name: 'Ram', rel: 'father' },
  { id: 'mohan', name: 'Mohan', rel: 'son' }
];
var result = { found: true, steps: steps, summary: { en: "daughter's husband's brother", hi: null } };
assert.strictEqual(links.sentence(result, 'bash'), "Mohan is your daughter's husband's brother.");
assert.strictEqual(links.sentence(result, 'amit'), "Mohan is Bash's daughter's husband's brother.");
var hi = { found: true, steps: [{ id: 'a', name: 'Amit' }, { id: 'b', name: 'Bash' }], summary: { en: "mother's father", hi: 'नाना जी' } };
assert.strictEqual(links.sentence(hi, 'a'), "Bash is your mother's father (नाना जी).");
assert.strictEqual(links.sentence({ found: false }, 'a'), 'No link found in the records.');
assert.strictEqual(links.sentence({ found: true, steps: [{ id: 'a' }] }, 'a'), "That's the same person.");

var people = [{ id: 'r1', name: 'Ram Lal' }, { id: 'r2', name: 'Sri Ram' }, { id: 'v', name: 'Ved', name_hi: 'वेद' }];
assert.deepStrictEqual(links.matches(people, 'ram').map(function (p) { return p.id; }), ['r1', 'r2']);
assert.deepStrictEqual(links.matches(people, 'वे').map(function (p) { return p.id; }), ['v']);
assert.deepStrictEqual(links.matches(people, '  '), []);

assert.strictEqual(links.query({ tab: 'people', a: 'x y', b: 'z' }), '?tab=people&a=x%20y&b=z');
assert.strictEqual(links.query({ tab: 'villages', va: 'bakheta', vb: null }), '?tab=villages&a=bakheta');
assert.strictEqual(links.whoLine({ relation: 'son of Vijay', village: 'Bakheta' }), 'son of Vijay · Bakheta');
assert.strictEqual(links.whoLine({ relation: '', village: null }), 'Village not recorded');
console.log('links_check ok');
