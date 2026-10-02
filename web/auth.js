(function (auth) {
  var ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var EPOCH = Date.UTC(2026, 0, 1);
  var STEP_MS = 10 * 60 * 1000;
  var HOUR_MS = 60 * 60 * 1000;
  var FIRST_USE_MS = 24 * HOUR_MS;
  var SIG_SPACE = 1048576;

  function hexBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function bytesHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function signature(keyHex, data) {
    return crypto.subtle.importKey('raw', hexBytes(keyHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (key) {
        return crypto.subtle.sign('HMAC', key, new Uint8Array([(data >> 16) & 255, (data >> 8) & 255, data & 255]));
      })
      .then(function (buffer) {
        var b = new Uint8Array(buffer);
        return (b[0] << 12) | (b[1] << 4) | (b[2] >> 4);
      });
  }

  function toText(value) {
    var s = '';
    for (var i = 0; i < 8; i++) {
      s = ALPHABET.charAt(value % 32) + s;
      value = Math.floor(value / 32);
    }
    return s.slice(0, 4) + '-' + s.slice(4);
  }

  function toValue(code) {
    var value = 0;
    for (var i = 0; i < 8; i++) value = value * 32 + ALPHABET.indexOf(code.charAt(i));
    return value;
  }

  auth.HOUR_MS = HOUR_MS;

  auth.normalize = function (input) {
    var s = String(input).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (s.length !== 8) return null;
    for (var i = 0; i < 8; i++) if (ALPHABET.indexOf(s.charAt(i)) < 0) return null;
    return s;
  };

  auth.makeCode = function (keyHex, nowMs, hours) {
    var step = Math.floor((nowMs - EPOCH) / STEP_MS);
    var data = step * 2 + (hours === 2 ? 1 : 0);
    return signature(keyHex, data).then(function (sig) {
      return toText(data * SIG_SPACE + sig);
    });
  };

  auth.readCode = function (keyHex, input, nowMs) {
    var code = auth.normalize(input);
    if (!code) return Promise.resolve({ status: 'bad' });
    var value = toValue(code);
    var data = Math.floor(value / SIG_SPACE);
    return signature(keyHex, data).then(function (expected) {
      if (expected !== value % SIG_SPACE) return { status: 'bad' };
      var issued = EPOCH + Math.floor(data / 2) * STEP_MS;
      if (nowMs - issued >= FIRST_USE_MS) return { status: 'expired' };
      return { status: 'ok', code: code, hours: data % 2 ? 2 : 1 };
    });
  };

  auth.hashPassword = function (password, saltHex, iterations) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: hexBytes(saltHex), iterations: iterations, hash: 'SHA-256' }, key, 256);
      })
      .then(bytesHex);
  };

  auth.decide = function (config, input, nowMs, usedCodes) {
    if (!config || !String(input).trim()) return Promise.resolve({ error: 'wrong' });
    var admin = config.admin;
    return auth.hashPassword(input, admin.salt, admin.iterations).then(function (hash) {
      if (hash === admin.hash) return { kind: 'admin' };
      return auth.readCode(config.signing_key, input, nowMs).then(function (r) {
        if (r.status === 'bad') return { error: 'wrong' };
        if (r.status === 'expired') return { error: 'expired' };
        if (usedCodes.indexOf(r.code) >= 0) return { error: 'used' };
        return { kind: 'code', code: r.code, expires: nowMs + r.hours * HOUR_MS };
      });
    });
  };

  auth.sessionState = function (session, nowMs) {
    if (!session) return 'none';
    if (session.kind === 'admin') return 'admin';
    if (session.kind === 'code' && typeof session.expires === 'number') {
      return nowMs < session.expires ? 'active' : 'over';
    }
    return 'none';
  };
})(typeof FT !== 'undefined' ? (FT.auth = {}) : module.exports);
