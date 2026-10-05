(function (admin) {
  var TABS = [['deletes', 'Pending deletes'], ['accounts', 'Accounts'], ['roles', 'Roles'],
    ['families', 'Villages & families'], ['log', 'Change log']];
  var ROLE = { global: 'Global admin', village: 'Village admin', branch: 'Branch rep' };
  var state = {};
  var main;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  admin.esc = esc;

  admin.describe = function (entry) {
    var before = entry.before || {}, after = entry.after || {};
    return Object.keys(after).filter(function (k) { return before[k] !== after[k]; }).map(function (k) {
      var was = before[k] === null || before[k] === undefined ? '—' : before[k];
      var now = after[k] === null || after[k] === undefined ? '—' : after[k];
      return k + ': ' + was + ' → ' + now;
    }).join('; ');
  };

  admin.logPath = function (personId) {
    return '/change-log?limit=100' + (personId ? '&person_id=' + encodeURIComponent(personId) : '');
  };

  function api() { return FT.api; }
  function say(text) { document.getElementById('admin-msg').textContent = text; }
  function label(p) { return p ? (p.name || p.name_hi || p.id) : ''; }
  function personName(id) { return label(state.byId[id]) || id; }

  function familyName(id) {
    var name = '';
    state.villages.forEach(function (v) { v.families.forEach(function (f) { if (f.id === id) name = f.name; }); });
    return name;
  }

  function table(head, rows) {
    if (!rows.length) return '<p>Nothing here yet.</p>';
    return '<table><thead><tr>' + head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  function select(name, title, options) {
    return '<label>' + esc(title) + '<select name="' + name + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
    }).join('') + '</select></label>';
  }

  function text(name, title) {
    return '<label>' + esc(title) + '<input name="' + name + '" autocomplete="off"></label>';
  }

  function adminOf(villageId) {
    return state.me.is_global || state.me.roles.some(function (r) {
      return r.scope === 'village' && r.scope_id === villageId;
    });
  }

  var tabs = {
    deletes: function () {
      return api().call('GET', '/delete-requests').then(function (list) {
        return table(['Person', 'Asked by', 'When', ''], list.map(function (r) {
          return '<tr><td>' + esc(r.person) + '</td><td>' + esc(r.requested_by) + '</td><td>' +
            esc(r.created_at.slice(0, 10)) + '</td><td>' +
            '<button type="button" data-post="/delete-requests/' + r.id + '/approve">Approve</button> ' +
            '<button type="button" data-post="/delete-requests/' + r.id + '/reject">Reject</button></td></tr>';
        }));
      });
    },
    accounts: function () {
      return api().call('GET', '/accounts').then(function (list) {
        return '<input id="acct-search" placeholder="Search living people" aria-label="Search living people">' +
          table(['Person', 'Family', 'Username', ''], list.map(function (a) {
            var id = esc(a.person_id);
            var own = a.person_id === state.me.id;
            var buttons = !a.can_manage ? '' : a.username
              ? '<button type="button" data-rename="' + id + '">Change username</button>' +
                (own ? '' : ' <button type="button" data-reset="' + id + '">Reset password</button> ' +
                  '<button type="button" data-remove="' + id + '">Remove login</button>')
              : '<button type="button" data-create="' + id + '">Create login</button>';
            var key = [a.name, a.name_hi, a.username].filter(Boolean).join(' ').toLowerCase();
            return '<tr data-search="' + esc(key) + '"><td>' + esc(a.name || a.name_hi) + '</td><td>' +
              esc(familyName(a.family_id)) + '</td><td class="uname">' + esc(a.username || '—') + '</td><td>' + buttons + '</td></tr>';
          }));
      });
    },
    roles: function () {
      return api().call('GET', '/role-grants').then(function (list) {
        var holders = state.people.filter(function (p) { return p.has_account; }).map(function (p) { return [p.id, label(p)]; });
        var scopes = (state.me.is_global ? [['village', 'Village admin'], ['global', 'Global admin']] : []).concat([['branch', 'Branch rep']]);
        var villages = state.villages.filter(function (v) { return adminOf(v.id); }).map(function (v) { return [v.id, v.name]; });
        var everyone = state.people.map(function (p) { return [p.id, label(p) + (p.family_id ? ' (' + familyName(p.family_id) + ')' : '')]; });
        return table(['Person', 'Role', 'Covers', ''], list.map(function (g) {
          return '<tr><td>' + esc(g.person) + '</td><td>' + esc(ROLE[g.scope]) + '</td><td>' + esc(g.scope_name) +
            '</td><td><button type="button" data-revoke="' + g.id + '">Remove</button></td></tr>';
        })) +
          '<h3>Give a role</h3><form data-form="grant" class="admin-form">' +
          select('person_id', 'Person (must have a login)', holders) +
          select('scope', 'Role', scopes) +
          select('village_id', 'Village (for village admin)', villages) +
          select('branch_id', 'Branch starts at (for branch rep)', everyone) +
          '<button type="submit">Give role</button></form>';
      });
    },
    families: function () {
      var html = state.villages.map(function (v) {
        return '<h3>' + esc(v.name) + '</h3><ul>' + v.families.map(function (f) {
          return '<li><a href="./?family=' + encodeURIComponent(f.id) + '">' + esc(f.name) + '</a> — starts at ' +
            esc(personName(f.root_person_id)) + '</li>';
        }).join('') + '</ul>';
      }).join('');
      if (state.me.is_global) {
        html += '<h3>Add a village</h3><form data-form="village" class="admin-form">' +
          text('name', 'Village name') + text('district', 'District') + text('state', 'State') +
          '<button type="submit">Add village</button></form>';
      }
      var mine = state.villages.filter(function (v) { return adminOf(v.id); }).map(function (v) { return [v.id, v.name]; });
      if (mine.length) {
        html += '<h3>Add a family</h3><form data-form="family" class="admin-form">' +
          select('village_id', 'Village', mine) + text('name', 'Family name') +
          text('root_name', 'Eldest known ancestor') + text('root_name_hi', 'Ancestor, Hindi name') +
          select('root_gender', 'Ancestor gender', [['male', 'Male'], ['female', 'Female']]) +
          '<button type="submit">Add family</button></form>';
      }
      return Promise.resolve(html);
    },
    log: function () {
      return api().call('GET', admin.logPath(state.logPerson)).then(function (list) {
        var options = [['', 'Everyone']].concat(state.people.map(function (p) { return [p.id, label(p)]; }));
        var filter = '<label>Person<select id="log-person">' + options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (o[0] === (state.logPerson || '') ? ' selected' : '') + '>' +
            esc(o[1]) + '</option>';
        }).join('') + '</select></label>';
        return filter + table(['When', 'Who', 'Person', 'What', 'Details'], list.map(function (e) {
          return '<tr><td>' + esc(e.at.replace('T', ' ').slice(0, 16)) + '</td><td>' + esc(personName(e.actor_id)) +
            '</td><td>' + esc(e.person_id ? personName(e.person_id) : '') + '</td><td>' + esc(e.action) +
            '</td><td>' + esc(admin.describe(e)) + '</td></tr>';
        }));
      });
    }
  };

  function reload() {
    return Promise.all([api().call('GET', '/people'), api().call('GET', '/villages')]).then(function (r) {
      state.people = r[0];
      state.byId = {};
      r[0].forEach(function (p) { state.byId[p.id] = p; });
      state.villages = r[1];
    });
  }

  function open(tab) {
    state.tab = tabs[tab] ? tab : 'deletes';
    history.replaceState(null, '', '#' + state.tab);
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-tab') === state.tab ? 'page' : 'false');
    });
    main.innerHTML = '<p>Loading…</p>';
    return tabs[state.tab]().then(function (html) {
      main.innerHTML = html;
      var logPerson = document.getElementById('log-person');
      if (logPerson) {
        logPerson.addEventListener('change', function () {
          state.logPerson = logPerson.value;
          open('log');
        });
      }
      var search = document.getElementById('acct-search');
      if (search) {
        search.addEventListener('input', function () {
          var q = search.value.trim().toLowerCase();
          Array.prototype.forEach.call(main.querySelectorAll('tr[data-search]'), function (tr) {
            tr.hidden = q && tr.getAttribute('data-search').indexOf(q) < 0;
          });
        });
      }
    }, function (err) { main.innerHTML = '<p class="form-msg">' + esc(err.message) + '</p>'; });
  }

  function showSecret(r) {
    var box = document.getElementById('secret');
    box.hidden = false;
    box.innerHTML = '<p>Send this to them now. The password is shown only once.</p>' +
      '<p class="secret-value">Username: <b>' + esc(r.username) + '</b><br>Password: <b>' + esc(r.password) + '</b></p>' +
      '<button type="button" id="secret-copy">Copy</button>';
    document.getElementById('secret-copy').addEventListener('click', function () {
      var textValue = 'Family Roots login\nhttps://jainparivar.online\nUsername: ' + r.username + '\nPassword: ' + r.password;
      if (navigator.clipboard) navigator.clipboard.writeText(textValue);
      this.textContent = 'Copied';
    });
  }

  function done(promise, after, button) {
    say('');
    if (button) button.disabled = true;
    promise.then(function (r) {
      return reload().then(function () { return open(state.tab); }).then(function () { if (after) after(r); });
    }, function (err) {
      if (button) button.disabled = false;
      say(err.message);
    });
  }

  function armed(button) {
    if (button.getAttribute('data-armed') === '1') return true;
    button.setAttribute('data-armed', '1');
    button.textContent = 'Click again to confirm';
    return false;
  }

  function startRename(button, id) {
    var cell = button.closest('tr').querySelector('.uname');
    var current = cell.textContent;
    cell.innerHTML = '<form data-form="rename" data-id="' + esc(id) + '"><input name="username" autocomplete="off" value="' +
      esc(current) + '" aria-label="New username"> <button type="submit">Save</button></form>';
    cell.querySelector('input').focus();
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b) return;
    var id;
    var post = b.getAttribute('data-post');
    if (post) {
      if (/\/approve$/.test(post) && !armed(b)) return;
      done(api().call('POST', post, {}), null, b);
    }
    else if ((id = b.getAttribute('data-rename'))) startRename(b, id);
    else if ((id = b.getAttribute('data-create'))) done(api().call('POST', '/accounts', { person_id: id }), showSecret, b);
    else if ((id = b.getAttribute('data-reset'))) done(api().call('POST', '/accounts/' + encodeURIComponent(id) + '/password', {}), showSecret, b);
    else if ((id = b.getAttribute('data-remove')) && armed(b)) done(api().call('DELETE', '/accounts/' + encodeURIComponent(id)), null, b);
    else if ((id = b.getAttribute('data-revoke')) && armed(b)) done(api().call('DELETE', '/role-grants/' + id), null, b);
  }

  function onSubmit(e) {
    var form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    var v = {};
    Array.prototype.forEach.call(form.elements, function (el) { if (el.name) v[el.name] = el.value.trim(); });
    var kind = form.getAttribute('data-form');
    var request;
    if (kind === 'rename') {
      request = api().call('PATCH', '/accounts/' + encodeURIComponent(form.getAttribute('data-id')), { username: v.username });
    } else if (kind === 'grant') {
      request = api().call('POST', '/role-grants', {
        person_id: v.person_id, scope: v.scope,
        scope_id: v.scope === 'village' ? v.village_id : v.scope === 'branch' ? v.branch_id : ''
      });
    } else if (kind === 'village') {
      request = api().call('POST', '/villages', { name: v.name, district: v.district || null, state: v.state || null });
    } else {
      request = api().call('POST', '/families', {
        village_id: v.village_id, name: v.name,
        root: { name: v.root_name || null, name_hi: v.root_name_hi || null, gender: v.root_gender }
      });
    }
    done(request, function () { say('Saved.'); }, form.querySelector('button[type=submit]'));
  }

  admin.start = function () {
    FT.api.root = FT.api.base(location.hostname);
    main = document.getElementById('main');
    main.addEventListener('click', onClick);
    main.addEventListener('submit', onSubmit);
    api().call('GET', '/me').then(function (me) {
      state.me = me;
      if (!me.is_admin) { main.innerHTML = '<p>Only admins can open this page.</p>'; return null; }
      var nav = document.getElementById('tabs');
      nav.innerHTML = TABS.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>';
      }).join('');
      nav.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tab]');
        if (b) open(b.getAttribute('data-tab'));
      });
      return reload().then(function () { return open(location.hash.slice(1)); });
    }).catch(function (err) {
      if (err.status === 401) location.assign('./');
      else main.innerHTML = '<p class="form-msg">' + esc(err.message) + '</p>';
    });
  };
})(typeof FT !== 'undefined' ? (FT.admin = {}) : module.exports);
