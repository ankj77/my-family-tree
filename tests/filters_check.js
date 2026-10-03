var assert = require('assert');
var filters = require('../web/filters.js');

function person(id, life, extra) {
  return Object.assign({ id: id, life: life, children: [], spouses: [] }, extra || {});
}

function keptIds(tree) {
  return Object.keys(filters.livingKeep(tree)).sort();
}

function keepsLinesThatReachSomeoneLiving() {
  var tree = person('root', 'deceased', { children: [
    person('a', 'deceased', { children: [person('a1', 'living')] }),
    person('b', null, { children: [person('b1', 'deceased')] }),
    person('c', 'deceased', { spouses: [person('c_wife', 'living')] })
  ] });
  assert.deepStrictEqual(keptIds(tree), ['a', 'a1', 'c', 'root']);
}

function aDiedDateOverridesLiving() {
  var tree = person('root', null, { children: [person('x', 'living', { died: '1990' })] });
  assert.deepStrictEqual(keptIds(tree), []);
}

function nobodyLivingKeepsNothing() {
  assert.deepStrictEqual(keptIds(person('root', 'deceased')), []);
}

keepsLinesThatReachSomeoneLiving();
aDiedDateOverridesLiving();
nobodyLivingKeepsNothing();
console.log('filters_check: all passed');
