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
      remove: function (c) { delete classes[c]; },
      toggle: function (c) { if (classes[c]) delete classes[c]; else classes[c] = true; },
      contains: function (c) { return !!classes[c]; }
    },
    setAttribute: function () {},
    focus: function () {},
    children: [],
    insertBefore: function (child) { this.children.push(child); },
    appendChild: function (child) { this.children.push(child); },
    addEventListener: function (type, fn) { listeners[type] = fn; },
    fire: function (type) { listeners[type]({ preventDefault: function () {}, stopPropagation: function () {} }); }
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
var replaced = [];
global.location = { hash: '', pathname: '/my-family-tree/family-tree.html', search: '', reload: function () {} };
global.history = { replaceState: function (a, b, url) { replaced.push(url); global.location.hash = ''; } };

var auth = require('../web/auth.js');
var SALT = '00112233445566778899aabbccddeeff';
var KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';

function reset(saved, hash) {
  elements = {};
  store = saved || {};
  replaced = [];
  global.location.hash = hash || '';
}

function labels(ids) {
  return ids.reduce(function (all, id) {
    return all.concat((elements[id] ? elements[id].children : []).map(function (c) { return c.textContent; }));
  }, []);
}

function settle() {
  return new Promise(function (r) { setTimeout(r, 300); });
}

async function setup() {
  global.CONFIG = {
    contact: 'Ankur',
    admin: { salt: SALT, iterations: 1000, hash: await auth.hashPassword('open sesame', SALT, 1000) },
    signing_key: KEY
  };
}

async function doubleSubmitUnlocksOnce() {
  reset();
  var code = await auth.makeCode(KEY, Date.now(), 1);
  var unlocks = 0;
  auth.start(function () { unlocks++; });
  elements['login-input'].value = code;
  elements['login-form'].fire('submit');
  elements['login-form'].fire('submit');
  await settle();
  assert.strictEqual(unlocks, 1);
  assert.deepStrictEqual(JSON.parse(store['ft-used-codes']), [code.replace('-', '')]);
}

function relativeWithTypedCodeIsGuestWithLogOut() {
  reset({ 'ft-session': JSON.stringify({ kind: 'code', expires: Date.now() + 3600000 }) });
  auth.start(function () {});
  assert.strictEqual(elements.who.textContent, 'Guest · 60 min left');
  assert.strictEqual(elements.avatar.textContent, 'G');
  assert.deepStrictEqual(labels(['menu']), ['Log out']);
  assert.deepStrictEqual(labels(['top-actions']), []);
}

function adminMenuHasNewCodeAndLogOut() {
  reset({ 'ft-session': JSON.stringify({ kind: 'admin' }) });
  auth.start(function () {});
  assert.strictEqual(elements.who.textContent, 'Admin');
  assert.strictEqual(elements.avatar.textContent, 'A');
  assert.deepStrictEqual(labels(['top-actions']), []);
  assert.deepStrictEqual(labels(['menu']), ['New code', 'Log out']);
}

async function linkLogsInWithName() {
  var code = await auth.makeCode(KEY, Date.now(), 1);
  reset({}, auth.shareLink('', code, 'Sunita').slice(0));
  var unlocks = 0;
  auth.start(function () { unlocks++; });
  await settle();
  assert.strictEqual(unlocks, 1);
  assert.strictEqual(JSON.parse(store['ft-session']).name, 'Sunita');
  assert.deepStrictEqual(JSON.parse(store['ft-used-codes']), [code.replace('-', '')]);
  assert.strictEqual(elements.who.textContent, 'Sunita · 60 min left');
  assert.strictEqual(elements.avatar.textContent, 'S');
  assert.deepStrictEqual(replaced, ['/my-family-tree/family-tree.html']);
}

async function linkIsIgnoredWhenAlreadyLoggedIn() {
  var code = await auth.makeCode(KEY, Date.now(), 1);
  reset({ 'ft-session': JSON.stringify({ kind: 'admin' }) }, auth.shareLink('', code, 'Sunita'));
  auth.start(function () {});
  await settle();
  assert.strictEqual(JSON.parse(store['ft-session']).kind, 'admin');
  assert.strictEqual(store['ft-used-codes'], undefined);
  assert.deepStrictEqual(replaced, ['/my-family-tree/family-tree.html']);
}

async function usedLinkShowsTimeOver() {
  var code = await auth.makeCode(KEY, Date.now(), 1);
  reset({ 'ft-used-codes': JSON.stringify([code.replace('-', '')]) }, auth.shareLink('', code, 'Sunita'));
  var unlocks = 0;
  auth.start(function () { unlocks++; });
  await settle();
  assert.strictEqual(unlocks, 0);
  assert.strictEqual(elements['login-msg'].textContent, 'Your time is over. Ask Ankur for a new code.');
}

async function main() {
  await setup();
  await doubleSubmitUnlocksOnce();
  relativeWithTypedCodeIsGuestWithLogOut();
  adminMenuHasNewCodeAndLogOut();
  await linkLogsInWithName();
  await linkIsIgnoredWhenAlreadyLoggedIn();
  await usedLinkShowsTimeOver();
  console.log('auth_start_check: all passed');
}

main().catch(function (e) { console.error(e); process.exit(1); });
