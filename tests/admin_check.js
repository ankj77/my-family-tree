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
assert.deepStrictEqual(admin.tempLogin('neha', { username: '', password: '', minutes: '10' }),
  { person_id: 'neha', temporary: true, minutes: 10 });
assert.deepStrictEqual(admin.tempLogin('neha', { username: 'guest1', password: '123456', minutes: '15' }),
  { person_id: 'neha', temporary: true, minutes: 15, username: 'guest1', password: '123456' });
assert.deepStrictEqual(admin.guestLogin({ username: '', password: '', minutes: '5', scope: 'family', family_id: 'bakheta' }),
  { minutes: 5, scope: 'family', family_id: 'bakheta' });
assert.deepStrictEqual(admin.guestLogin({ username: '', password: '', minutes: '5', scope: 'reader', family_id: 'bakheta' }),
  { minutes: 5, scope: 'reader' });
assert.strictEqual(admin.logPath('', 'logins'), '/change-log?limit=100&kind=logins');
assert.strictEqual(admin.localTime('2026-10-09T10:53:00').length, 16);
var t0 = Date.UTC(2026, 9, 9, 10, 0, 0);
assert.strictEqual(admin.timeLeft('2026-10-09T10:04:32', t0), '4:32 left');
assert.strictEqual(admin.timeLeft('2026-10-09T10:00:05', t0), '0:05 left');
assert.strictEqual(admin.timeLeft('2026-10-09T09:59:00', t0), 'Ended');
assert.strictEqual(admin.roleList({ username: null, roles: [] }), '—');
assert.strictEqual(admin.roleList({ username: 'amit', roles: [] }), 'Family reader');
assert.strictEqual(admin.roleList({ username: 'mohan', roles: ['Global admin', 'Node admin (Ram)'] }), 'Global admin, Node admin (Ram)');
console.log('admin_check ok');
