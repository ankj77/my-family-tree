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

  var MAX_NAME = 30;

  function cleanName(name) {
    return String(name || '').trim().slice(0, MAX_NAME);
  }

  auth.shareLink = function (base, code, name) {
    var link = base + '#code=' + String(code).replace('-', '');
    var clean = cleanName(name);
    return clean ? link + '&name=' + encodeURIComponent(clean) : link;
  };

  auth.readLink = function (hash) {
    var params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    var code = params.get('code');
    if (!code) return null;
    return { code: code, name: cleanName(params.get('name')) };
  };

  auth.sessionState = function (session, nowMs) {
    if (!session) return 'none';
    if (session.kind === 'admin') return 'admin';
    if (session.kind === 'code' && typeof session.expires === 'number') {
      return nowMs < session.expires ? 'active' : 'over';
    }
    return 'none';
  };

  var TEXT = {
    en: {
      placeholder: 'Enter your code or password',
      enter: 'Enter',
      wrong: "That code isn't right. Check it and try again.",
      expired: 'This code has expired. Ask {c} for a new one.',
      over: 'Your time is over. Ask {c} for a new code.',
      nocrypto: 'This browser cannot check codes here. Open the family tree website link instead.',
      who: '{n} · {m} min left',
      admin: 'Admin',
      guest: 'Guest',
      logout: 'Log out'
    },
    hi: {
      placeholder: 'अपना कोड या पासवर्ड डालें',
      enter: 'खोलें',
      wrong: 'यह कोड सही नहीं है। जाँचकर फिर से डालें।',
      expired: 'इस कोड का समय निकल गया है। {c} से नया कोड माँगें।',
      over: 'आपका समय पूरा हो गया। {c} से नया कोड माँगें।',
      nocrypto: 'यह ब्राउज़र यहाँ कोड नहीं जाँच सकता। परिवार वृक्ष की वेबसाइट का लिंक खोलें।',
      who: '{n} · {m} मिनट बाकी',
      admin: 'एडमिन',
      guest: 'अतिथि',
      logout: 'लॉग आउट'
    }
  };
  var text = TEXT.en;

  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) {} }
  function loadJson(key) { try { return JSON.parse(load(key)); } catch (e) { return null; } }

  function button(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function selectText(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function showCodePanel(config) {
    var sheet = document.getElementById('sheet');
    var body = document.getElementById('sheet-body');
    body.innerHTML =
      '<h3>New code</h3>' +
      '<label class="code-name">Who is it for?' +
      '<input id="code-name" maxlength="30" autocomplete="off" placeholder="Name, e.g. Sunita"></label>' +
      '<div class="code-hours">' +
      '<button type="button" data-hours="1">1 hour</button>' +
      '<button type="button" data-hours="2">2 hours</button>' +
      '</div>' +
      '<div id="code-result" hidden>' +
      '<p class="code-value" id="code-value"></p>' +
      '<button type="button" id="code-copy">Copy link</button>' +
      '<p class="code-link" id="code-link"></p>' +
      '<p class="code-note" id="code-note"></p>' +
      '</div>';
    sheet.style.borderLeftColor = 'var(--hl)';
    sheet.classList.remove('hidden');
    var nameInput = document.getElementById('code-name');
    var result = document.getElementById('code-result');
    var value = document.getElementById('code-value');
    var copy = document.getElementById('code-copy');
    var linkText = document.getElementById('code-link');
    var note = document.getElementById('code-note');
    Array.prototype.forEach.call(body.querySelectorAll('[data-hours]'), function (b) {
      b.addEventListener('click', function () {
        var hours = Number(b.getAttribute('data-hours'));
        var name = nameInput.value.trim();
        auth.makeCode(config.signing_key, Date.now(), hours).then(function (code) {
          value.textContent = code;
          linkText.textContent = auth.shareLink(location.origin + location.pathname, code, name);
          copy.textContent = 'Copy link';
          note.textContent = (name ? 'For ' + name + '. ' : '') + 'Use within 24 hours. Lasts ' +
            (hours === 1 ? '1 hour' : '2 hours') + ' from when they log in.';
          result.hidden = false;
        });
      });
    });
    copy.addEventListener('click', function () {
      var write = navigator.clipboard ? navigator.clipboard.writeText(linkText.textContent) : Promise.reject();
      write.then(function () { copy.textContent = 'Copied'; }, function () { selectText(linkText); });
    });
    nameInput.focus();
  }

  function whoName(session) {
    if (session.kind === 'admin') return text.admin;
    return session.name || text.guest;
  }

  function showWho(session, label) {
    document.getElementById('who').textContent = label;
    document.getElementById('avatar').textContent = whoName(session).charAt(0).toUpperCase();
  }

  function adminControls(config) {
    var newCode = button('+ New code', function () { showCodePanel(config); });
    newCode.id = 'new-code';
    document.getElementById('top-actions').appendChild(newCode);
  }

  function logOutItem() {
    var logOut = button(text.logout, function () { drop('ft-session'); location.reload(); });
    logOut.id = 'log-out';
    logOut.setAttribute('role', 'menuitem');
    document.getElementById('menu').appendChild(logOut);
  }

  function watch(session) {
    function tick() {
      var left = session.expires - Date.now();
      if (left <= 0) { location.reload(); return; }
      showWho(session, text.who.replace('{n}', whoName(session)).replace('{m}', Math.ceil(left / 60000)));
    }
    tick();
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
  }

  auth.start = function (onUnlock) {
    var config = JSON.parse(document.getElementById('auth-data').textContent);
    var contact = (config && config.contact) || 'the admin';
    text = TEXT[load('ft-lang') === 'hi' ? 'hi' : 'en'];
    var box = document.getElementById('login');
    var input = document.getElementById('login-input');
    var msg = document.getElementById('login-msg');
    input.placeholder = text.placeholder;
    input.setAttribute('aria-label', text.placeholder);
    document.getElementById('login-enter').textContent = text.enter;

    function say(key) { msg.textContent = text[key].replace('{c}', contact); }

    function unlock(session) {
      box.classList.add('hidden');
      onUnlock();
      if (session.kind === 'admin') {
        adminControls(config);
        showWho(session, text.admin);
      } else {
        watch(session);
      }
      logOutItem();
    }

    var link = auth.readLink(location.hash);
    if (link) history.replaceState(null, '', location.pathname + location.search);

    var saved = loadJson('ft-session');
    var state = auth.sessionState(saved, Date.now());
    if (state === 'admin' || state === 'active') { unlock(saved); return; }
    if (state === 'over') { drop('ft-session'); say('over'); }
    input.focus();

    var checking = false;

    function attempt(value, name) {
      if (checking) return;
      checking = true;
      msg.textContent = '';
      var used = loadJson('ft-used-codes') || [];
      Promise.resolve()
        .then(function () { return auth.decide(config, value, Date.now(), used); })
        .then(function (r) {
          checking = false;
          if (r.error) { say(r.error === 'used' ? 'over' : r.error); return; }
          var session = r.kind === 'admin' ? { kind: 'admin' } :
            { kind: 'code', expires: r.expires, name: name };
          if (r.code) save('ft-used-codes', JSON.stringify(used.concat([r.code])));
          save('ft-session', JSON.stringify(session));
          input.value = '';
          unlock(session);
        })
        .catch(function () { checking = false; say('nocrypto'); });
    }

    document.getElementById('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      attempt(input.value, '');
    });

    if (link) attempt(link.code, link.name);
  };
})(typeof FT !== 'undefined' ? (FT.auth = {}) : module.exports);
