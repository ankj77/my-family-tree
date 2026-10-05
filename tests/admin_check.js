var assert = require('assert');
var admin = require('../web/admin.js');

assert.strictEqual(admin.esc('<x>'), '&lt;x&gt;');
assert.strictEqual(admin.describe({ before: { born: null }, after: { born: '1991' } }), 'born: — → 1991');
assert.strictEqual(admin.describe({ before: { a: 1, b: 2 }, after: { a: 1, b: 3 } }), 'b: 2 → 3');
assert.strictEqual(admin.describe({ before: null, after: { username: 'neha' } }), 'username: — → neha');
assert.strictEqual(admin.describe({ before: { name: 'X' }, after: null }), '');
console.log('admin_check ok');
