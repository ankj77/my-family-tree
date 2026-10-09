var assert = require('assert');
var admin = require('../web/admin.js');

assert.strictEqual(admin.esc('<x>'), '&lt;x&gt;');
assert.strictEqual(admin.describe({ before: { born: null }, after: { born: '1991' } }), 'born: — → 1991');
assert.strictEqual(admin.describe({ before: { a: 1, b: 2 }, after: { a: 1, b: 3 } }), 'b: 2 → 3');
assert.strictEqual(admin.describe({ before: null, after: { username: 'neha' } }), 'username: — → neha');
assert.strictEqual(admin.describe({ before: { name: 'X' }, after: null }), '');
assert.strictEqual(admin.logPath(''), '/change-log?limit=100');
assert.strictEqual(admin.logPath('a b'), '/change-log?limit=100&person_id=a%20b');
assert.strictEqual(admin.villageTitle({ name: 'Kakroi', district: 'Sonipat', state: 'Haryana' }),
  'Kakroi — District Sonipat · State Haryana');
assert.strictEqual(admin.villageTitle({ name: 'Chirag Dilli', district: null, state: 'Delhi' }), 'Chirag Dilli — State Delhi');
assert.strictEqual(admin.villageTitle({ name: 'Aanwali', district: null, state: null }), 'Aanwali');
console.log('admin_check ok');
