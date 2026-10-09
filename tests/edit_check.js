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

assert.deepStrictEqual(edit.actionsFor({ can_edit: true, can_add_father: true, can_delete: false }, true),
  ['edit', 'child', 'father']);

assert.deepStrictEqual(edit.payload([['name', '  Kiran '], ['born', ''], ['sort_order', '3'], ['note', ' ']]),
  { name: 'Kiran', born: null, sort_order: 3, note: null });
assert.deepStrictEqual(edit.payload([['sort_order', '']]), { sort_order: null });

assert.deepStrictEqual(edit.changes({ name: 'Amit', born: null, city: undefined }, { name: 'Amit', born: '1990', city: null }),
  { born: '1990' });

assert.strictEqual(edit.editNames(false).indexOf('family_id'), -1);
assert.deepStrictEqual(edit.editNames(true).slice(-3), ['father_id', 'mother_id', 'family_id']);

assert.deepStrictEqual(edit.villageOptions([
  { id: 'k', name: 'Kakroi', district: 'Sonipat', state: 'Haryana' }, { id: 'b', name: 'Bakheta', district: null, state: null }
]), [['', 'Not recorded'], ['b', 'Bakheta'], ['k', 'Kakroi (Sonipat, Haryana)']]);

function fakeHindi(text) { return Promise.resolve('हि:' + text); }
edit.withHindi({ name: 'Ram' }, { name: 'Ram', name_hi: 'राम' }, fakeHindi).then(function (v) {
  assert.deepStrictEqual(v, { name: 'Ram' });
});
edit.withHindi({ name: 'Ramesh' }, { name: 'Ram', name_hi: 'राम' }, fakeHindi).then(function (v) {
  assert.deepStrictEqual(v, { name: 'Ramesh', name_hi: 'हि:Ramesh' });
});
edit.withHindi({ name: 'Ram' }, { name: 'Ram', name_hi: null }, fakeHindi).then(function (v) {
  assert.strictEqual(v.name_hi, 'हि:Ram');
});
edit.withHindi({ name: null }, {}, fakeHindi).then(function (v) { assert.deepStrictEqual(v, { name: null }); });
edit.withHindi({ name: 'Kiran' }, {}, function () { return Promise.resolve(''); }).then(function (v) {
  assert.deepStrictEqual(v, { name: 'Kiran' });
});

assert.deepStrictEqual(edit.tidy({ life: 'living', died: '1990' }), { life: 'living', died: null });
assert.deepStrictEqual(edit.tidy({ life: 'deceased', died: '1990' }), { life: 'deceased', died: '1990' });
assert.deepStrictEqual(edit.tidy({ name: 'X' }), { name: 'X' });
assert.deepStrictEqual(edit.tidy({ address_country: 'India', address_city: 'Delhi', address_abroad: 'x' }),
  { address_country: 'India', address_city: 'Delhi', address_abroad: null });
assert.deepStrictEqual(edit.tidy({ address_country: 'Outside India', address_city: 'Delhi', address_state: 'Delhi', address_abroad: 'Toronto, Canada' }),
  { address_country: 'Outside India', address_city: null, address_state: null, address_abroad: 'Toronto, Canada' });

assert.strictEqual(edit.esc('<b a="1">&'), '&lt;b a=&quot;1&quot;&gt;&amp;');
assert.strictEqual(edit.esc(null), '');
console.log('edit_check ok');
