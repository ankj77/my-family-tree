(function (api) {
  api.base = function (hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'http://localhost:5001'
      : 'https://api.jainparivar.online';
  };

  api.hindiUrl = function (text) {
    return 'https://inputtools.google.com/request?itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=jainparivar&text=' +
      encodeURIComponent(text);
  };

  api.firstHindi = function (reply) {
    var match = reply && reply[0] === 'SUCCESS' && reply[1] && reply[1][0];
    return (match && match[1] && match[1][0]) || '';
  };

  api.hindi = function (text) {
    if (!text) return Promise.resolve('');
    return fetch(api.hindiUrl(text)).then(function (r) { return r.json(); })
      .then(api.firstHindi, function () { return ''; });
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

  api.who = function (p) {
    return [p.relation, p.village || 'Village not recorded'].filter(Boolean).join(' · ');
  };

  api.otherTrees = function (people, villages, currentFamily, shown) {
    var trees = {};
    villages.forEach(function (v) {
      v.families.forEach(function (f) { trees[f.id] = api.treeLabel(v, f); });
    });
    return people.filter(function (p) {
      return p.home_family !== currentFamily && !(shown && shown[p.id]);
    }).map(function (p) {
      var where = trees[p.home_family] || p.village || 'Village not recorded';
      return { id: p.id, name: p.name, name_hi: p.name_hi,
               tree: [p.relation, where].filter(Boolean).join(' · '),
               url: trees[p.home_family] ? api.urlFor(p.home_family, p.id) : null };
    });
  };

  function loadOthers(me, currentFamily) {
    if (me.guest) return;
    FT.onLink = function (a, b) { location.assign(location.pathname + api.linkTreeUrl(a, b)); };
    FT.meId = me.id;
    api.call('GET', '/directory').then(function (people) {
      FT.who = {};
      people.forEach(function (p) { FT.who[p.id] = api.who(p); });
      if (FT.renderPicks) FT.renderPicks();
      FT.otherTrees = api.otherTrees(people, api.villages || [], currentFamily, FT.byId);
    }, function () {});
  }

  api.roleText = function (me) {
    if (me.guest) return 'Guest (view only)';
    if (me.is_global) return 'Global admin';
    var scopes = me.roles.map(function (r) { return r.scope; });
    if (scopes.indexOf('family') >= 0) return 'Family tree admin';
    if (scopes.indexOf('branch') >= 0) return 'Node admin';
    if (scopes.indexOf('reader') >= 0) return 'Global reader';
    return 'Family reader';
  };

  function parse(text) {
    try { return text ? JSON.parse(text) : {}; } catch (e) { return {}; }
  }

  var pending = 0;
  function busy(change) {
    pending += change;
    var root = typeof document !== 'undefined' && document.documentElement;
    if (root) root.classList.toggle('api-busy', pending > 0);
  }

  api.call = function (method, path, body) {
    busy(1);
    return send(method, path, body).then(function (data) { busy(-1); return data; },
      function (err) { busy(-1); throw err; });
  };

  function send(method, path, body) {
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
  }

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

  api.togglePassword = function (input, button) {
    var reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', reveal ? 'true' : 'false');
  };

  function wireLogin() {
    var form = document.getElementById('login-form');
    var pass = document.getElementById('login-pass');
    var show = document.getElementById('login-show');
    show.addEventListener('click', function () {
      api.togglePassword(pass, show);
      pass.focus();
    });
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

  api.treeLabel = function (village, family) {
    return village.name + ' · ' + (family.root_name || family.name);
  };

  api.treeLabelHtml = function (village, family) {
    var esc = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    };
    return '<b>' + esc(village.name) + '</b> · ' + esc(family.root_name || family.name);
  };

  api.villageNamed = function (villages, name) {
    var key = String(name || '').trim().toLowerCase();
    return villages.filter(function (v) {
      return v.families.length && v.name.toLowerCase() === key;
    })[0] || null;
  };

  api.villagesMatching = function (villages, q) {
    var key = String(q || '').trim().toLowerCase();
    return villages.filter(function (v) {
      return v.families.length && v.name.toLowerCase().indexOf(key) >= 0;
    }).sort(function (a, b) {
      return (b.name.toLowerCase().indexOf(key) === 0) - (a.name.toLowerCase().indexOf(key) === 0) ||
        a.name.localeCompare(b.name);
    });
  };

  api.showVillage = function (vid) {
    var v = (api.villages || []).filter(function (x) { return x.id === vid; })[0];
    if (!v) return;
    api.call('GET', '/villages/' + encodeURIComponent(vid) + '/people').then(function (people) {
      people.forEach(function (p) { if (p.home_family) p.url = api.urlFor(p.home_family, p.id); });
      FT.villageGroup = { key: 'village:' + vid, kind: 'origin', name: v.name, suffix: v.state || '',
                          members: people.map(function (p) { return { person: p, owner: p }; }) };
      FT.showPlace(FT.villageGroup.key);
    }, function () {});
  };

  function familySwitcher(villages, current) {
    var pick = document.createElement('div');
    pick.id = 'tree-pick';
    var place = document.createElement('input');
    place.id = 'village-picker';
    place.setAttribute('autocomplete', 'off');
    place.setAttribute('aria-label', 'Village');
    place.setAttribute('aria-controls', 'village-list');
    var list = document.createElement('div');
    list.id = 'village-list';
    list.setAttribute('role', 'listbox');
    list.classList.add('hidden');
    var select = document.createElement('select');
    select.id = 'family-picker';
    select.setAttribute('aria-label', 'Family tree');
    var chosen = null, shown = [], active = -1;
    villages.forEach(function (v) {
      v.families.forEach(function (f) { if (f.id === current) chosen = v; });
    });

    function go(id) { location.assign(location.pathname + api.urlFor(id)); }

    function showFamilies(v) {
      chosen = v;
      place.value = v.name;
      select.innerHTML = '';
      var here = v.families.some(function (f) { return f.id === current; });
      if (!here) {
        var ask = document.createElement('option');
        ask.textContent = 'Choose family';
        ask.disabled = true;
        ask.selected = true;
        select.appendChild(ask);
      }
      v.families.forEach(function (f) {
        var option = document.createElement('option');
        option.value = f.id;
        option.textContent = f.root_name || f.name;
        option.selected = f.id === current;
        select.appendChild(option);
      });
    }

    function showList() {
      shown = api.villagesMatching(villages, place.value);
      list.innerHTML = '';
      shown.forEach(function (v, i) {
        var option = document.createElement('button');
        option.type = 'button';
        option.className = 'village-option' + (i === active ? ' on' : '');
        option.setAttribute('role', 'option');
        option.textContent = v.name;
        option.addEventListener('mousedown', function (e) { e.preventDefault(); choose(v); });
        list.appendChild(option);
      });
      if (shown.length) list.classList.remove('hidden');
      else list.classList.add('hidden');
      if (active >= 0 && list.children[active] && list.children[active].scrollIntoView) {
        list.children[active].scrollIntoView({ block: 'nearest' });
      }
    }

    function hideList() {
      list.classList.add('hidden');
      active = -1;
    }

    function choose(v) {
      hideList();
      place.value = v.name;
      if (v !== chosen) {
        location.assign(location.pathname + api.urlFor(v.families[0].id) + '&village=' + encodeURIComponent(v.id));
        return;
      }
      place.blur();
      api.showVillage(v.id);
    }

    place.addEventListener('focus', function () {
      place.placeholder = place.value || 'Village';
      place.value = '';
      active = -1;
      showList();
    });
    place.addEventListener('input', function () {
      active = -1;
      showList();
    });
    place.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' && shown.length) {
        e.preventDefault(); active = (active + 1) % shown.length; showList();
      } else if (e.key === 'ArrowUp' && shown.length) {
        e.preventDefault(); active = (active <= 0 ? shown.length : active) - 1; showList();
      } else if (e.key === 'Enter' && shown.length) {
        e.preventDefault(); choose(shown[active >= 0 ? active : 0]);
      } else if (e.key === 'Escape') {
        place.blur();
      }
    });
    place.addEventListener('blur', function () {
      hideList();
      if (chosen) place.value = chosen.name;
    });
    select.addEventListener('change', function () { go(select.value); });

    if (chosen) showFamilies(chosen);
    pick.appendChild(place);
    pick.appendChild(list);
    pick.appendChild(select);
    document.querySelector('#toolbar .brand').appendChild(pick);
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
      '<label>New password (6 digits)<input type="password" name="new" autocomplete="new-password" inputmode="numeric" ' +
      'pattern="[0-9]{6}" minlength="6" maxlength="6" required></label>' +
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

  api.timeLeft = function (ends, nowMs) {
    var seconds = Math.floor((new Date(ends + 'Z').getTime() - nowMs) / 1000);
    if (seconds <= 0) return '';
    var s = seconds % 60;
    return Math.floor(seconds / 60) + ':' + (s < 10 ? '0' : '') + s + ' left';
  };

  function countDown(me) {
    var who = document.getElementById('who');
    var base = who.textContent;
    var timer = setInterval(function () {
      var left = api.timeLeft(me.login_ends, Date.now());
      if (left) { who.textContent = base + ' · ' + left; return; }
      clearInterval(timer);
      who.textContent = base;
      api.call('POST', '/logout', {}).catch(function () {});
      showLogin('Your temporary login has ended.');
    }, 1000);
  }

  function accountMenu(me) {
    var name = me.name || me.name_hi || me.username;
    document.getElementById('who').textContent = name + ' · ' + api.roleText(me);
    document.getElementById('avatar').textContent = name.charAt(0).toUpperCase();
    if (!me.guest) menuItem('Change password', passwordSheet);
    if (!me.guest) menuItem('Links', function () { location.assign('links.html'); });
    if (me.is_admin) menuItem('Admin', function () { location.assign('admin.html'); });
    menuItem('Log out', function () {
      api.call('POST', '/logout', {}).then(function () { location.reload(); }, function () { location.reload(); });
    });
    var version = document.createElement('p');
    version.className = 'menu-version';
    version.textContent = 'Version __VERSION__';
    document.getElementById('menu').appendChild(version);
  }

  api.linkTreeUrl = function (a, b) {
    return '?la=' + encodeURIComponent(a) + '&lb=' + encodeURIComponent(b);
  };

  api.villageTreeUrl = function (a, v) {
    return '?la=' + encodeURIComponent(a) + '&lv=' + encodeURIComponent(v);
  };

  function linkChips(first, last, note) {
    var bar = document.getElementById('picks');
    bar.innerHTML = '';
    [first, last].forEach(function (p) {
      var chip = document.createElement('span');
      chip.className = 'pick';
      chip.appendChild(document.createTextNode(p.name || p.name_hi));
      var who = document.createElement('small');
      who.className = 'pick-who';
      who.textContent = ' ' + api.who(p);
      chip.appendChild(who);
      var x = document.createElement('a');
      x.className = 'pick-x';
      x.href = './';
      x.setAttribute('aria-label', 'Back to the tree');
      x.textContent = '×';
      chip.appendChild(x);
      bar.appendChild(chip);
    });
    if (note) {
      var text = document.createElement('span');
      text.className = 'pick-note';
      text.textContent = note;
      bar.appendChild(text);
    }
    var clear = document.createElement('a');
    clear.className = 'pick-clear';
    clear.href = './';
    clear.textContent = 'Clear';
    bar.appendChild(clear);
  }

  function startLink(me, a, b, v) {
    var query = '?a=' + encodeURIComponent(a) + (v ? '&v=' + encodeURIComponent(v) : '&b=' + encodeURIComponent(b));
    return api.call('GET', '/links/tree' + query).then(function (r) {
      if (!r.found) { location.assign('./?nolink=1'); return; }
      document.getElementById('login').classList.add('hidden');
      FT.boot({ tree: r.tree, unlinked: [], summary: r.counts });
      FT.state.ends = [a, r.steps[r.steps.length - 1].id];
      FT.linkEdges = r.edges;
      FT.init();
      FT.setView('chart');
      FT.expandAll();
      accountMenu(me);
      api.onLoggedOut = function () { showLogin('Your login has ended. Please log in again.'); };
      loadOthers(me, null);
      var first = r.steps[0], last = r.steps[r.steps.length - 1];
      var note = v ? 'Closest person from ' + (last.village || 'that village') : '';
      FT.renderPicks = function () { linkChips(first, last, note); };
      FT.renderPicks();
      document.getElementById('summary').textContent = r.steps.length + ' people on this link · ' +
        'search another name to link it to ' + (first.name || first.name_hi);
    });
  }

  api.start = function () {
    api.root = api.base(location.hostname);
    wireLogin();
    api.call('GET', '/me').then(function (me) {
      api.me = me;
      if (param('la') && (param('lb') || param('lv')) && !me.guest) {
        return startLink(me, param('la'), param('lb'), param('lv'));
      }
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
        if (me.login_ends) countDown(me);
        loadOthers(me, api.familyId);
        if (param('village')) api.showVillage(param('village'));
        if (param('nolink')) document.getElementById('summary').textContent = 'No link found in the records between those two people.';
        var person = param('person');
        if (person) FT.openPerson(person);
        else {
          var grandfather = FT.grandfatherOf(me.id);
          if (grandfather) FT.showBranch(grandfather.id);
        }
      });
    }).catch(function (err) {
      showLogin(err.status === 401 ? '' : err.message);
    });
  };
})(typeof FT !== 'undefined' ? (FT.api = {}) : module.exports);
