var assert = require('assert');
var motion = require('../web/motion.js');

var vimal = { id: 'vimal', name: 'Vimal', name_hi: 'विमल', gender: 'female' };
var vijay = { id: 'vijay', name: 'Vijay', name_hi: 'विजय', gender: 'male', spouses: [vimal] };
var ridhi = { id: 'ridhi', name: 'Ridhi', gender: 'female' };
var raya = { id: 'raya', name: 'Raya', gender: 'female' };
var ankur = { id: 'ankur', name: 'Ankur', name_hi: 'अंकुर', gender: 'male', spouses: [ridhi], children: [raya] };

var keys = function (rels) { return rels.map(function (r) { return r.node.id + (r.spouse ? '+' : '') + ':' + r.key; }); };

assert.deepStrictEqual(keys(motion.relations(ankur, 'ankur', vijay, ridhi)),
  ['ankur:self', 'ankur+:wife', 'vijay:father', 'vijay+:mother', 'raya:daughter']);
assert.deepStrictEqual(keys(motion.relations(ankur, 'ridhi', vijay, ridhi)),
  ['ankur+:self', 'ankur:husband', 'raya:daughter']);
assert.deepStrictEqual(keys(motion.relations(ankur, 'ankur', null, null)), ['ankur:self', 'raya:daughter']);

assert.strictEqual(motion.hoverText(ankur, null, vijay, 'en'), 'Ankur — son of Vijay & Vimal');
assert.strictEqual(motion.hoverText(ankur, null, vijay, 'hi'), 'अंकुर — विजय व विमल के पुत्र');
assert.strictEqual(motion.hoverText(ankur, ridhi, vijay, 'en'), 'Ridhi — wife of Ankur');
assert.strictEqual(motion.hoverText(vijay, null, null, 'en'), null);
