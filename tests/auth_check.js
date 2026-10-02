var assert = require('assert');
var auth = require('../web/auth.js');

var KEY = '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';
var OTHER_KEY = 'ff1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';
var HOUR = 3600000;
var NOW = Date.UTC(2026, 9, 2, 12, 0);
var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
var SALT = '00112233445566778899aabbccddeeff';
var CONFIG = {
  contact: 'Ankur',
  admin: { salt: SALT, iterations: 1000, hash: '111d7870ba309c2ec0f57e584e4e314fc577046f365a791c67e56fab8127b1fa' },
  signing_key: KEY
};

async function codesRoundTrip() {
  for (var hours of [1, 2]) {
    var code = await auth.makeCode(KEY, NOW, hours);
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    var r = await auth.readCode(KEY, code, NOW + 23 * HOUR);
    assert.deepStrictEqual(r, { status: 'ok', code: code.replace('-', ''), hours: hours });
  }
}

async function firstUseWindowIs24Hours() {
  var code = await auth.makeCode(KEY, NOW, 1);
  assert.strictEqual((await auth.readCode(KEY, code, NOW + 23 * HOUR + 59 * 60000)).status, 'ok');
  assert.strictEqual((await auth.readCode(KEY, code, NOW + 24 * HOUR)).status, 'expired');
  assert.strictEqual((await auth.readCode(KEY, code, NOW + 25 * HOUR)).status, 'expired');
}

async function anyChangedCharacterIsRejected() {
  var plain = (await auth.makeCode(KEY, NOW, 2)).replace('-', '');
  for (var i = 0; i < 8; i++) {
    var swapped = ALPHABET[(ALPHABET.indexOf(plain[i]) + 1) % 32];
    var tampered = plain.slice(0, i) + swapped + plain.slice(i + 1);
    assert.strictEqual((await auth.readCode(KEY, tampered, NOW)).status, 'bad', 'position ' + i);
  }
  assert.strictEqual((await auth.readCode(OTHER_KEY, plain, NOW)).status, 'bad');
}

async function forgivingInput() {
  var code = await auth.makeCode(KEY, NOW, 1);
  var messy = '  ' + code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace('-', ' ') + '\n';
  assert.strictEqual((await auth.readCode(KEY, messy, NOW)).status, 'ok');
  assert.strictEqual(auth.normalize('k7m4-qx9p'), 'K7M4QX9P');
  assert.strictEqual(auth.normalize('I0O1-LLLL'), '1001' + '1111');
  assert.strictEqual(auth.normalize('hello'), null);
  assert.strictEqual(auth.normalize('K7M4-QX9PZ'), null);
  assert.strictEqual(auth.normalize('K7M4-QX9U'), null);
}

async function passwordHashMatchesPython() {
  assert.strictEqual(await auth.hashPassword('open sesame', SALT, 1000), CONFIG.admin.hash);
}

async function decisions() {
  assert.deepStrictEqual(await auth.decide(CONFIG, 'open sesame', NOW, []), { kind: 'admin' });
  assert.deepStrictEqual(await auth.decide(CONFIG, 'wrong one', NOW, []), { error: 'wrong' });
  assert.deepStrictEqual(await auth.decide(CONFIG, '   ', NOW, []), { error: 'wrong' });
  assert.deepStrictEqual(await auth.decide(null, 'open sesame', NOW, []), { error: 'wrong' });

  var code = await auth.makeCode(KEY, NOW, 2);
  var plain = code.replace('-', '');
  var loginAt = NOW + 3 * HOUR;
  assert.deepStrictEqual(await auth.decide(CONFIG, code, loginAt, []),
    { kind: 'code', code: plain, expires: loginAt + 2 * HOUR });
  assert.deepStrictEqual(await auth.decide(CONFIG, code, loginAt, [plain]), { error: 'used' });
  assert.deepStrictEqual(await auth.decide(CONFIG, code, NOW + 30 * HOUR, []), { error: 'expired' });
}

async function adminPasswordShapedLikeACodeStillLogsIn() {
  var salt = SALT;
  var lookalike = 'K7M4QX9P';
  var config = {
    contact: 'Ankur',
    admin: { salt: salt, iterations: 1000, hash: await auth.hashPassword(lookalike, salt, 1000) },
    signing_key: KEY
  };
  assert.deepStrictEqual(await auth.decide(config, lookalike, NOW, []), { kind: 'admin' });
}

function sessions() {
  assert.strictEqual(auth.sessionState(null, NOW), 'none');
  assert.strictEqual(auth.sessionState({ kind: 'admin' }, NOW), 'admin');
  assert.strictEqual(auth.sessionState({ kind: 'code', expires: NOW + 1 }, NOW), 'active');
  assert.strictEqual(auth.sessionState({ kind: 'code', expires: NOW }, NOW), 'over');
  assert.strictEqual(auth.sessionState({ kind: 'code' }, NOW), 'none');
  assert.strictEqual(auth.sessionState({ kind: 'guest' }, NOW), 'none');
}

async function main() {
  await codesRoundTrip();
  await firstUseWindowIs24Hours();
  await anyChangedCharacterIsRejected();
  await forgivingInput();
  await passwordHashMatchesPython();
  await decisions();
  await adminPasswordShapedLikeACodeStillLogsIn();
  sessions();
  console.log('auth_check: all passed');
}

main().catch(function (e) { console.error(e); process.exit(1); });
