var assert = require('assert');

function fakeElement() {
  var listeners = {};
  var classes = {};
  return {
    textContent: '',
    value: '',
    placeholder: '',
    classList: {
      add: function (c) { classes[c] = true; },
      contains: function (c) { return !!classes[c]; }
    },
    setAttribute: function () {},
    focus: function () {},
    children: [],
    insertBefore: function (child) { this.children.push(child); },
    appendChild: function (child) { this.children.push(child); },
    addEventListener: function (type, fn) { listeners[type] = fn; },
    fire: function (type) { listeners[type]({ preventDefault: function () {} }); }
  };
}

var elements = {};
global.document = {
  getElementById: function (id) {
    if (id === 'auth-data') return { textContent: JSON.stringify(global.CONFIG) };
    if (!elements[id]) elements[id] = fakeElement();
    return elements[id];
  },
  createElement: fakeElement,
  addEventListener: function () {}
};
var store = {};
global.localStorage = {
  getItem: function (k) { return k in store ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.setInterval = function () {};

var auth = require('../web/auth.js');

async function doubleSubmitUnlocksOnce() {
  var salt = '00112233445566778899aabbccddeeff';
  global.CONFIG = {
    contact: 'Ankur',
    admin: { salt: salt, iterations: 1000, hash: await auth.hashPassword('open sesame', salt, 1000) },
    signing_key: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0'
  };
  var code = await auth.makeCode(global.CONFIG.signing_key, Date.now(), 1);
  var unlocks = 0;
  auth.start(function () { unlocks++; });
  elements['login-input'].value = code;
  elements['login-form'].fire('submit');
  elements['login-form'].fire('submit');
  await new Promise(function (r) { setTimeout(r, 300); });
  assert.strictEqual(unlocks, 1);
  assert.deepStrictEqual(JSON.parse(store['ft-used-codes']), [code.replace('-', '')]);
}

function buttonLabels() {
  return ['toolbar', 'extras'].reduce(function (all, id) {
    return all.concat((elements[id] ? elements[id].children : []).map(function (c) { return c.textContent; }));
  }, []);
}

function relativesGetLogOut() {
  elements = {};
  store = { 'ft-session': JSON.stringify({ kind: 'code', expires: Date.now() + 3600000 }) };
  auth.start(function () {});
  assert.ok(buttonLabels().indexOf('Log out') >= 0, 'labels: ' + buttonLabels());
}

function adminGetsLogOutOnce() {
  elements = {};
  store = { 'ft-session': JSON.stringify({ kind: 'admin' }) };
  auth.start(function () {});
  assert.strictEqual(buttonLabels().filter(function (l) { return l === 'Log out'; }).length, 1);
}

doubleSubmitUnlocksOnce()
  .then(relativesGetLogOut)
  .then(adminGetsLogOutOnce)
  .then(function () { console.log('auth_start_check: all passed'); })
  .catch(function (e) { console.error(e); process.exit(1); });
