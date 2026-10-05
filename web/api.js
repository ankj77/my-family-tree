(function (api) {
  api.base = function (hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'http://localhost:5001'
      : 'https://api.jainparivar.online';
  };

  api.pickFamily = function (requested, stored, home, villages) {
    var ids = [];
    villages.forEach(function (v) { v.families.forEach(function (f) { ids.push(f.id); }); });
    var choices = [requested, home, stored];
    for (var i = 0; i < choices.length; i++) {
      if (choices[i] && ids.indexOf(choices[i]) >= 0) return choices[i];
    }
    return ids[0] || null;
  };

  api.urlFor = function (familyId, personId) {
    return '?family=' + encodeURIComponent(familyId) +
      (personId ? '&person=' + encodeURIComponent(personId) : '');
  };

  api.roleText = function (me) {
    if (me.is_global) return 'Global admin';
    var scopes = me.roles.map(function (r) { return r.scope; });
    if (scopes.indexOf('village') >= 0) return 'Village admin';
    if (scopes.indexOf('branch') >= 0) return 'Branch rep';
    return 'Member';
  };

  function parse(text) {
    try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
  }

  api.call = function (method, path, body) {
    var options = { method: method, credentials: 'include', headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return fetch(api.root + path, options).then(function (r) {
      return r.text().then(function (text) {
        var data = parse(text);
        if (r.ok) return data;
        var err = new Error(data.error || ('Request failed (' + r.status + ')'));
        err.status = r.status;
        if (r.status === 401 && path !== '/login' && api.onLoggedOut) api.onLoggedOut();
        throw err;
      });
    }, function () {
      var err = new Error('Cannot reach the server. Check your internet connection.');
      err.status = 0;
      throw err;
    });
  };

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  api.reloadAt = function (personId) {
    location.assign(location.pathname + api.urlFor(api.familyId, personId));
  };

  function showLogin(message) {
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('login-msg').textContent = message || '';
    document.getElementById('login-user').focus();
  }

  function wireLogin() {
    var form = document.getElementById('login-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = document.getElementById('login-msg');
      msg.textContent = '';
      api.call('POST', '/login', {
        username: document.getElementById('login-user').value,
        password: document.getElementById('login-pass').value
      }).then(function () { location.reload(); }, function (err) { msg.textContent = err.message; });
    });
  }

  function familySwitcher(villages, current) {
    var select = document.createElement('select');
    select.id = 'family-picker';
    select.setAttribute('aria-label', 'Family');
    villages.forEach(function (v) {
      var group = document.createElement('optgroup');
      group.label = v.name;
      v.families.forEach(function (f) {
        var option = document.createElement('option');
        option.value = f.id;
        option.textContent = f.name;
        if (f.id === current) option.selected = true;
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    select.addEventListener('change', function () {
      location.assign(location.pathname + api.urlFor(select.value));
    });
    document.querySelector('#toolbar .brand').appendChild(select);
  }

  function menuItem(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.addEventListener('click', onClick);
    document.getElementById('menu').appendChild(b);
  }

  function passwordSheet() {
    var body = document.getElementById('sheet-body');
    body.innerHTML = '<h3>Change password</h3><form id="pw-form" class="edit-form">' +
      '<label>Old password<input type="password" name="old" autocomplete="current-password" required></label>' +
      '<label>New password<input type="password" name="new" autocomplete="new-password" minlength="8" required></label>' +
      '<div class="form-buttons"><button type="submit">Save</button></div>' +
      '<p class="form-msg" role="alert"></p></form>';
    document.getElementById('sheet').classList.remove('hidden');
    var form = document.getElementById('pw-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = form.querySelector('.form-msg');
      api.call('POST', '/me/password', { old: form.elements.old.value, 'new': form.elements['new'].value })
        .then(function () { msg.textContent = 'Password changed.'; form.reset(); },
              function (err) { msg.textContent = err.message; });
    });
  }

  function accountMenu(me) {
    var name = me.name || me.name_hi || me.username;
    document.getElementById('who').textContent = name + ' · ' + api.roleText(me);
    document.getElementById('avatar').textContent = name.charAt(0).toUpperCase();
    menuItem('Change password', passwordSheet);
    if (me.is_admin) menuItem('Admin', function () { location.assign('admin.html'); });
    menuItem('Log out', function () {
      api.call('POST', '/logout', {}).then(function () { location.reload(); }, function () { location.reload(); });
    });
  }

  api.start = function () {
    api.root = api.base(location.hostname);
    wireLogin();
    api.call('GET', '/me').then(function (me) {
      api.me = me;
      return api.call('GET', '/villages').then(function (villages) {
        api.villages = villages;
        var id = api.pickFamily(param('family'), stored('ft-family'), me.home_family, villages);
        if (!id) throw new Error('No family has been set up yet.');
        api.familyId = id;
        store('ft-family', id);
        return api.call('GET', '/families/' + encodeURIComponent(id) + '/tree');
      }).then(function (data) {
        document.getElementById('login').classList.add('hidden');
        FT.boot(data);
        FT.init();
        familySwitcher(api.villages, api.familyId);
        accountMenu(me);
        api.onLoggedOut = function () { showLogin('Your login has ended. Please log in again.'); };
        var person = param('person');
        if (person) FT.openPerson(person);
      });
    }).catch(function (err) {
      showLogin(err.status === 401 ? '' : err.message);
    });
  };
})(typeof FT !== 'undefined' ? (FT.api = {}) : module.exports);
