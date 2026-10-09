var assert = require('assert');
var api = require('../web/api.js');

var villages = [
  { id: 'bakheta', families: [{ id: 'bakheta' }, { id: 'jain' }] },
  { id: 'pugthala', families: [{ id: 'pugthala' }] }
];
assert.strictEqual(api.pickFamily('pugthala', 'jain', 'bakheta', villages), 'pugthala');
assert.strictEqual(api.pickFamily('gone', 'jain', 'bakheta', villages), 'bakheta');
assert.strictEqual(api.pickFamily(null, 'jain', null, villages), 'jain');
assert.strictEqual(api.pickFamily(null, null, 'bakheta', villages), 'bakheta');
assert.strictEqual(api.pickFamily(null, null, null, villages), 'bakheta');
assert.strictEqual(api.pickFamily(null, null, null, []), null);

var attrs = {};
var input = { type: 'password' };
var button = { textContent: 'Show', setAttribute: function (k, v) { attrs[k] = v; } };
api.togglePassword(input, button);
assert.strictEqual(input.type, 'text');
assert.strictEqual(button.textContent, 'Hide');
assert.strictEqual(attrs['aria-pressed'], 'true');
assert.strictEqual(attrs['aria-label'], 'Hide password');
api.togglePassword(input, button);
assert.strictEqual(input.type, 'password');
assert.strictEqual(button.textContent, 'Show');
assert.strictEqual(attrs['aria-pressed'], 'false');

assert.strictEqual(api.urlFor('bakheta'), '?family=bakheta');
assert.strictEqual(api.urlFor('bal pabana', 'a&b'), '?family=bal%20pabana&person=a%26b');

assert.strictEqual(api.base('localhost'), 'http://localhost:5001');
assert.strictEqual(api.base('jainparivar.online'), 'https://api.jainparivar.online');

assert.strictEqual(api.firstHindi(['SUCCESS', [['Gautam', ['गौतम', 'गौत्तम'], [], {}]]]), 'गौतम');
assert.strictEqual(api.firstHindi(['FAILED_TO_PROCESS']), '');
assert.strictEqual(api.firstHindi(null), '');
assert.ok(api.hindiUrl('Ram Krishan').indexOf('text=Ram%20Krishan') > 0);
assert.strictEqual(api.treeLabel({ name: 'Pathri' }, { name: 'Jain', root_name: 'Ram Lal' }), 'Pathri · Ram Lal');
assert.strictEqual(api.treeLabel({ name: 'Pathri' }, { name: 'Jain', root_name: null }), 'Pathri · Jain');
assert.strictEqual(api.treeLabelHtml({ name: 'A<b>' }, { name: 'X', root_name: 'Ram' }), '<b>A&lt;b&gt;</b> · Ram');
assert.strictEqual(api.roleText({ is_global: true, roles: [] }), 'Global admin');
assert.strictEqual(api.roleText({ is_global: false, roles: [{ scope: 'village' }] }), 'Village admin');
assert.strictEqual(api.roleText({ is_global: false, roles: [{ scope: 'branch' }] }), 'Branch rep');
assert.strictEqual(api.roleText({ is_global: false, roles: [] }), 'Member');

var loggedOut = 0;
api.root = 'http://x';
api.onLoggedOut = function () { loggedOut++; };
global.fetch = function (url, options) {
  assert.strictEqual(url, 'http://x/people/amit');
  assert.strictEqual(options.credentials, 'include');
  assert.strictEqual(options.headers['Content-Type'], 'application/json');
  return Promise.resolve({ ok: false, status: 401, text: function () { return Promise.resolve('{"error":"Please log in"}'); } });
};
api.call('PATCH', '/people/amit', { born: '1990' }).then(function () {
  assert.fail('should reject');
}, function (err) {
  assert.strictEqual(err.status, 401);
  assert.strictEqual(err.message, 'Please log in');
  assert.strictEqual(loggedOut, 1);
  global.fetch = function () {
    return Promise.resolve({ ok: false, status: 502, text: function () { return Promise.resolve('<html>Bad gateway</html>'); } });
  };
  return api.call('GET', '/me').then(function () { assert.fail('should reject'); }, function (e) {
    assert.strictEqual(e.message, 'Request failed (502)');
    assert.strictEqual(loggedOut, 1);
    console.log('api_check ok');
  });
}).catch(function (e) { console.error(e); process.exit(1); });
