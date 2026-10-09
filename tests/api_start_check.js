var assert = require('assert');

function fakeElement() {
  var listeners = {};
  var classes = { hidden: true };
  return {
    textContent: '',
    value: '',
    id: '',
    children: [],
    classList: {
      add: function (c) { classes[c] = true; },
      remove: function (c) { delete classes[c]; },
      contains: function (c) { return !!classes[c]; }
    },
    setAttribute: function () {},
    focus: function () {},
    appendChild: function (child) { this.children.push(child); },
    addEventListener: function (type, fn) { listeners[type] = fn; }
  };
}

var elements;
var store;
var calls;
var routes;
var booted;
var inits;
var opened;

function reset(search, me) {
  elements = {};
  store = {};
  calls = [];
  booted = [];
  inits = 0;
  opened = [];
  global.location = { hostname: 'localhost', pathname: '/', search: search, reload: function () {} };
  routes = {
    'GET /me': { status: 200, body: me },
    'GET /villages': { status: 200, body: [{ id: 'v', name: 'Village', families: [{ id: 'f1', name: 'Family' }] }] },
    'GET /families/f1/tree': { status: 200, body: { tree: { id: 't' }, unlinked: [], summary: { total: 1 } } }
  };
  FT.api.onLoggedOut = null;
  FT.api.me = null;
}

var brand = fakeElement();
global.document = {
  getElementById: function (id) {
    if (!elements[id]) elements[id] = fakeElement();
    return elements[id];
  },
  querySelector: function () { return brand; },
  createElement: function () { var e = fakeElement(); e.options = []; return e; }
};
global.localStorage = {
  getItem: function (k) { return k in store ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); }
};
global.fetch = function (url, options) {
  var key = options.method + ' ' + url.replace(FT.api.root, '');
  calls.push(key);
  var route = routes[key] || { status: 404, body: { error: 'no route' } };
  return Promise.resolve({
    ok: route.status < 400,
    status: route.status,
    text: function () { return Promise.resolve(JSON.stringify(route.body)); }
  });
};
global.FT = {
  boot: function (data) { booted.push(data); },
  init: function () { inits++; },
  openPerson: function (id) { opened.push(id); },
  grandfatherOf: function (id) { return id === 'a' ? { id: 'gf' } : null; },
  showBranch: function (id) { opened.push('branch:' + id); }
};
require('../web/api.js');

function settle() {
  return new Promise(function (r) { setTimeout(r, 20); });
}

function menuLabels() {
  return elements.menu.children.map(function (c) { return c.textContent; });
}

var member = { id: 'a', name: 'Asha', username: 'asha', roles: [], is_admin: false, is_global: false, home_family: 'f1' };
var admin = { id: 'b', name: 'Bhanu', username: 'bhanu', roles: [], is_admin: true, is_global: true, home_family: 'f1' };

async function loggedInBoots() {
  reset('', member);
  FT.api.start();
  await settle();
  assert.deepStrictEqual(booted, [{ tree: { id: 't' }, unlinked: [], summary: { total: 1 } }]);
  assert.strictEqual(inits, 1);
  assert.strictEqual(brand.children.length, 1);
  assert.strictEqual(brand.children[0].id, 'tree-pick');
  assert.strictEqual(brand.children[0].children[1].id, 'family-picker');
  assert.strictEqual(elements.who.textContent, 'Asha · Member');
  assert.strictEqual(elements.avatar.textContent, 'A');
  assert.deepStrictEqual(menuLabels(), ['Change password', 'Log out']);
  assert.ok(elements.login.classList.contains('hidden'));
  assert.deepStrictEqual(opened, ['branch:gf']);
  assert.strictEqual(store['ft-family'], 'f1');
}

async function adminSeesAdminItem() {
  reset('', admin);
  elements = {};
  FT.api.start();
  await settle();
  assert.deepStrictEqual(menuLabels(), ['Change password', 'Admin', 'Log out']);
  assert.strictEqual(elements.who.textContent, 'Bhanu · Global admin');
}

async function loggedOutShowsLogin() {
  reset('', member);
  routes['GET /me'] = { status: 401, body: { error: 'Please log in' } };
  FT.api.start();
  await settle();
  assert.ok(!elements.login.classList.contains('hidden'));
  assert.strictEqual(elements['login-msg'].textContent, '');
  assert.deepStrictEqual(booted, []);
  assert.strictEqual(inits, 0);
}

async function serverErrorShowsMessage() {
  reset('', member);
  routes['GET /me'] = { status: 500, body: { error: 'Database down' } };
  FT.api.start();
  await settle();
  assert.ok(!elements.login.classList.contains('hidden'));
  assert.strictEqual(elements['login-msg'].textContent, 'Database down');
}

async function laterExpiryShowsMessage() {
  reset('', member);
  FT.api.start();
  await settle();
  assert.strictEqual(typeof FT.api.onLoggedOut, 'function');
  assert.ok(elements.login.classList.contains('hidden'));
  routes['GET /me'] = { status: 401, body: { error: 'Please log in' } };
  await FT.api.call('GET', '/me').then(function () { assert.fail('should reject'); }, function () {});
  assert.ok(!elements.login.classList.contains('hidden'));
  assert.strictEqual(elements['login-msg'].textContent, 'Your login has ended. Please log in again.');
}

async function personParamOpensThatPerson() {
  reset('?person=x', member);
  FT.api.start();
  await settle();
  assert.deepStrictEqual(opened, ['x']);
}

async function familyParamPicksTheTree() {
  reset('?family=f1', member);
  FT.api.start();
  await settle();
  assert.ok(calls.indexOf('GET /families/f1/tree') >= 0);
}

(async function () {
  await loggedInBoots();
  await adminSeesAdminItem();
  await loggedOutShowsLogin();
  await serverErrorShowsMessage();
  await laterExpiryShowsMessage();
  await personParamOpensThatPerson();
  await familyParamPicksTheTree();
  console.log('api_start_check ok');
})().catch(function (e) { console.error(e); process.exit(1); });
