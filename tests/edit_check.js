var assert = require('assert');
var edit = require('../web/edit.js');

assert.deepStrictEqual(edit.actionsFor({ can_edit: false, can_delete: false }, false), []);
assert.deepStrictEqual(edit.actionsFor({ can_edit: true, can_delete: 'request' }, false),
  ['edit', 'child', 'spouse', 'request']);
assert.deepStrictEqual(edit.actionsFor({ can_edit: true, can_delete: 'direct' }, true),
  ['edit', 'child', 'delete']);
assert.deepStrictEqual(edit.actionsFor({ can_edit: true, can_delete: false, delete_reason: 'has children' }, true),
  ['edit', 'child', 'blocked']);
assert.deepStrictEqual(edit.actionsFor({ can_edit: true, can_delete: 'request', delete_pending: true }, true),
  ['edit', 'child', 'pending']);

assert.deepStrictEqual(edit.payload([['name', '  Kiran '], ['born', ''], ['sort_order', '3'], ['note', ' ']]),
  { name: 'Kiran', born: null, sort_order: 3, note: null });
assert.deepStrictEqual(edit.payload([['sort_order', '']]), { sort_order: null });

assert.deepStrictEqual(edit.changes({ name: 'Amit', born: null, city: undefined }, { name: 'Amit', born: '1990', city: null }),
  { born: '1990' });

assert.strictEqual(edit.editNames(false).indexOf('family_id'), -1);
assert.deepStrictEqual(edit.editNames(true).slice(-3), ['father_id', 'mother_id', 'family_id']);

assert.strictEqual(edit.esc('<b a="1">&'), '&lt;b a=&quot;1&quot;&gt;&amp;');
assert.strictEqual(edit.esc(null), '');
console.log('edit_check ok');
