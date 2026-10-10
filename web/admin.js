(function (admin) {
  var TABS = [['accounts', 'Accounts'], ['roles', 'Roles'], ['deletes', 'Pending deletes'],
    ['families', 'Villages & families'], ['log', 'Change log']];
  var ROLE = { global: 'Global admin', family: 'Family tree admin', branch: 'Node admin', reader: 'Global reader' };
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

  admin.villageTitle = function (v) {
    var where = [v.district && 'District ' + v.district, v.state && 'State ' + v.state].filter(Boolean).join(' · ');
    return where ? v.name + ' — ' + where : v.name;
  };

  admin.logPath = function (personId, kind) {
    return '/change-log?limit=100' + (personId ? '&person_id=' + encodeURIComponent(personId) : '') +
      (kind ? '&kind=' + encodeURIComponent(kind) : '');
  };

  admin.localTime = function (at) {
    var d = new Date(at + 'Z');
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  var ACTIONS = { login: 'Logged in', logout: 'Logged out' };

  admin.timeLeft = function (ends, nowMs) {
    var seconds = Math.floor((new Date(ends + 'Z').getTime() - nowMs) / 1000);
    if (seconds <= 0) return 'Ended';
    var s = seconds % 60;
    return Math.floor(seconds / 60) + ':' + (s < 10 ? '0' : '') + s + ' left';
  };

  function timer(status) {
    if (!status) return '';
    if (status.unused_minutes) return 'Not used yet: ' + status.unused_minutes + ' min after first login';
    return '<span data-ends="' + esc(status.ends) + '">' + esc(admin.timeLeft(status.ends, Date.now())) + '</span>';
  }

  function tick() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ends]'), function (el) {
      el.textContent = admin.timeLeft(el.getAttribute('data-ends'), Date.now());
    });
  }

  function api() { return FT.api; }
  function say(text) { document.getElementById('admin-msg').textContent = text; }
  function label(p) { return p ? (p.name || p.name_hi || p.id) : ''; }
  function personName(id) {
    if (id && id.indexOf('guest:') === 0) return 'Guest ' + id.slice(6);
    return label(state.byId[id]) || id;
  }

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

  function text(name, title, required) {
    return '<label>' + esc(title) + '<input name="' + name + '" autocomplete="off"' + (required ? ' required' : '') + '></label>';
  }

  function familyOptions() {
    var out = [];
    state.villages.forEach(function (v) {
      v.families.forEach(function (f) { out.push([f.id, v.name + ' · ' + (f.root_name || f.name)]); });
    });
    return out;
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
      var guests = state.me.is_global ? api().call('GET', '/guests') : Promise.resolve(null);
      return Promise.all([api().call('GET', '/accounts'), guests]).then(function (r) {
        var list = r[0];
        return guestSection(r[1]) + '<h3>Family members</h3><input id="acct-search" placeholder="Search living people" aria-label="Search living people">' +
          table(['Person', 'Family', 'Username', ''], list.map(function (a) {
            var id = esc(a.person_id);
            var own = a.person_id === state.me.id;
            var buttons = !a.can_manage ? '' : a.username
              ? '<button type="button" data-rename="' + id + '">Change username</button>' +
                (own ? '' : ' <button type="button" data-reset="' + id + '">Reset password</button> ' +
                  '<button type="button" data-remove="' + id + '">Remove login</button>')
              : '<button type="button" data-create="' + id + '">Create login</button> ' +
                '<button type="button" data-temp="' + id + '">Temporary login</button>';
            var key = [a.name, a.name_hi, a.relation, a.username].filter(Boolean).join(' ').toLowerCase();
            return '<tr data-search="' + esc(key) + '"><td>' + esc(a.name || a.name_hi) +
              (a.relation ? ' <span class="relation">(' + esc(a.relation) + ')</span>' : '') + '</td><td>' +
              esc(familyName(a.family_id)) + '</td><td class="uname">' + esc(a.username || '—') +
              (a.temporary ? ' <span class="relation">(temporary · ' + timer(a.temporary) + ')</span>' : '') +
              '</td><td>' + buttons + '</td></tr>';
          }));
      });
    },
    roles: function () {
      return api().call('GET', '/role-grants').then(function (list) {
        var holders = state.people.filter(function (p) { return p.has_account; }).map(function (p) { return [p.id, label(p)]; });
        var scopes = state.me.is_global
          ? [['family', ROLE.family], ['branch', ROLE.branch], ['reader', ROLE.reader], ['global', ROLE.global]]
          : [['branch', ROLE.branch]];
        var everyone = state.people.map(function (p) { return [p.id, label(p) + (p.family_id ? ' (' + familyName(p.family_id) + ')' : '')]; });
        return table(['Person', 'Role', 'Covers', ''], list.map(function (g) {
          return '<tr><td>' + esc(g.person) + '</td><td>' + esc(ROLE[g.scope]) + '</td><td>' + esc(g.scope_name) +
            '</td><td><button type="button" data-revoke="' + g.id + '">Remove</button></td></tr>';
        })) +
          '<h3>Give a role</h3><form data-form="grant" class="admin-form">' +
          select('person_id', 'Person (must have a login)', holders) +
          select('scope', 'Role', scopes) +
          (state.me.is_global ? select('family_id', 'Family tree (for family tree admin)', familyOptions()) : '') +
          select('branch_id', 'Node: this person, his wife and all descendants (for node admin)', everyone) +
          '<button type="submit">Give role</button></form>';
      });
    },
    families: function () {
      var html = state.villages.filter(function (v) {
        return state.me.is_global || v.families.length;
      }).map(function (v) {
        var families = v.families.length ? v.families.map(function (f) {
          return '<li><a href="./?family=' + encodeURIComponent(f.id) + '">' + esc(f.name) + '</a> — starts at ' +
            esc(personName(f.root_person_id)) + '</li>';
        }).join('') : '<li>No family tree yet</li>';
        return '<h3>' + esc(admin.villageTitle(v)) + '</h3><ul>' + families + '</ul>';
      }).join('');
      if (state.me.is_global) {
        html += '<h3>Add a village</h3><form data-form="village" class="admin-form">' +
          text('name', 'Village name', true) + text('district', 'District (optional)') + text('state', 'State', true) +
          '<button type="submit">Add village</button></form>';
      }
      if (state.me.is_global) {
        html += '<h3>Add new family tree</h3><form data-form="family" class="admin-form">' +
          select('village_id', 'Village', state.villages.map(function (v) { return [v.id, v.name]; })) +
          text('root_name', 'Eldest known ancestor') +
          select('root_gender', 'Ancestor gender', [['male', 'Male'], ['female', 'Female']]) +
          '<button type="submit">Add new family tree</button></form>';
      }
      return Promise.resolve(html);
    },
    log: function () {
      return api().call('GET', admin.logPath(state.logPerson, state.logKind)).then(function (list) {
        var options = [['', 'Everyone']].concat(state.people.map(function (p) { return [p.id, label(p)]; }));
        var filter = '<label>Person<select id="log-person">' + options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (o[0] === (state.logPerson || '') ? ' selected' : '') + '>' +
            esc(o[1]) + '</option>';
        }).join('') + '</select></label>';
        var kinds = [['', 'Everything'], ['logins', 'Logins & logouts'], ['changes', 'Changes only']];
        filter += '<label>What<select id="log-kind">' + kinds.map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === (state.logKind || '') ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></label>';
        return filter + table(['When', 'Who', 'Person', 'What', 'Details'], list.map(function (e) {
          return '<tr><td>' + esc(admin.localTime(e.at)) + '</td><td>' + esc(personName(e.actor_id)) +
            '</td><td>' + esc(e.person_id ? personName(e.person_id) : '') + '</td><td>' + esc(ACTIONS[e.action] || e.action) +
            '</td><td>' + esc(admin.describe(e)) + '</td></tr>';
        }));
      });
    }
  };

  function visibleTabs() {
    return TABS.filter(function (t) { return t[0] !== 'deletes' || state.me.is_global; });
  }

  function reload() {
    return Promise.all([api().call('GET', '/people'), api().call('GET', '/villages')]).then(function (r) {
      state.people = r[0];
      state.byId = {};
      r[0].forEach(function (p) { state.byId[p.id] = p; });
      state.villages = r[1];
    });
  }

  function open(tab) {
    state.tab = tabs[tab] && visibleTabs().some(function (t) { return t[0] === tab; }) ? tab : TABS[0][0];
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
      var logKind = document.getElementById('log-kind');
      if (logKind) {
        logKind.addEventListener('change', function () {
          state.logKind = logKind.value;
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

  admin.secretText = function (r) {
    return 'Jain Parivar Online ' + (r.minutes ? 'temporary login (works for ' + r.minutes + ' minutes after you log in)' : 'login') +
      '\nhttps://jainparivar.online\nUsername: ' + r.username + '\nPassword: ' + r.password;
  };

  function showSecret(r) {
    var box = document.getElementById('secret');
    box.hidden = false;
    box.innerHTML = '<p>Send this to them now. The password is shown only once.' +
      (r.minutes ? ' It works for ' + esc(r.minutes) + ' minutes from the first login; if nobody uses it, it expires in ' +
        esc(r.unused_hours) + ' hours.' : '') + '</p>' +
      '<p class="secret-value">Username: <b>' + esc(r.username) + '</b><br>Password: <b>' + esc(r.password) + '</b></p>' +
      '<button type="button" id="secret-copy">Copy</button>';
    document.getElementById('secret-copy').addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(admin.secretText(r));
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

  function minutesField() {
    return '<select name="minutes" aria-label="Lasts for">' + [5, 10, 15].map(function (m) {
      return '<option value="' + m + '">' + m + ' minutes</option>';
    }).join('') + '</select>';
  }

  function tempFields() {
    return '<input name="username" autocomplete="off" placeholder="Username (optional)" aria-label="Username">' +
      '<input name="password" autocomplete="off" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" ' +
      'placeholder="6-digit password (optional)" aria-label="Password">' + minutesField();
  }

  function guestSection(guests) {
    if (!guests) return '';
    var rows = guests.length ? table(['Guest username', 'Can see', 'Time left', ''], guests.map(function (g) {
      return '<tr><td>' + esc(g.username) + '</td><td>' + esc(g.covers) + '</td><td>' + timer(g) + '</td><td>' +
        '<button type="button" data-guest-remove="' + esc(g.username) + '">Remove</button></td></tr>';
    })) : '<p>No guest logins right now.</p>';
    return '<h3>Guest logins</h3><p class="relation">For people outside the family, e.g. a demo. ' +
      'Guests can look at trees but cannot change anything, and do not see addresses or notes.</p>' +
      rows + '<form data-form="guest" class="temp-form">' + tempFields() +
      '<select name="scope" aria-label="Guest can see"><option value="family">Family reader: one family</option>' +
      '<option value="reader">Global reader: all families</option></select>' +
      '<select name="family_id" aria-label="Family for a family reader">' + familyOptions().map(function (o) {
        return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>';
      }).join('') + '</select>' +
      '<button type="submit">Create guest login</button></form>';
  }

  admin.guestLogin = function (v) {
    var out = admin.timedLogin(v);
    out.scope = v.scope;
    if (v.scope === 'family') out.family_id = v.family_id;
    return out;
  };

  admin.timedLogin = function (v) {
    var out = { minutes: Number(v.minutes) };
    if (v.username) out.username = v.username;
    if (v.password) out.password = v.password;
    return out;
  };

  function startTemp(button, id) {
    var cell = button.closest('td');
    cell.innerHTML = '<form data-form="temp" data-id="' + esc(id) + '" class="temp-form">' +
      '<label class="relation">Lasts for ' + minutesField() + '</label>' +
      '<button type="submit">Create</button> <button type="button" data-cancel>Cancel</button></form>';
    cell.querySelector('select').focus();
  }

  admin.tempLogin = function (id, v) {
    var out = admin.timedLogin(v);
    out.person_id = id;
    out.temporary = true;
    return out;
  };

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
    else if ((id = b.getAttribute('data-temp'))) startTemp(b, id);
    else if (b.hasAttribute('data-cancel')) open(state.tab);
    else if ((id = b.getAttribute('data-guest-remove')) && armed(b)) done(api().call('DELETE', '/guests/' + encodeURIComponent(id)), null, b);
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
    if (kind === 'guest') {
      done(api().call('POST', '/guests', admin.guestLogin(v)), showSecret, form.querySelector('button[type=submit]'));
      return;
    }
    if (kind === 'temp') {
      done(api().call('POST', '/accounts', admin.tempLogin(form.getAttribute('data-id'), v)), showSecret,
        form.querySelector('button[type=submit]'));
      return;
    }
    if (kind === 'rename') {
      request = api().call('PATCH', '/accounts/' + encodeURIComponent(form.getAttribute('data-id')), { username: v.username });
    } else if (kind === 'grant') {
      request = api().call('POST', '/role-grants', {
        person_id: v.person_id, scope: v.scope,
        scope_id: v.scope === 'family' ? v.family_id : v.scope === 'branch' ? v.branch_id : ''
      });
    } else if (kind === 'village') {
      request = api().call('POST', '/villages', { name: v.name, district: v.district || null, state: v.state || null });
    } else {
      request = api().hindi(v.root_name).then(function (hindi) {
        return api().call('POST', '/families', {
          village_id: v.village_id,
          root: { name: v.root_name || null, name_hi: hindi || null, gender: v.root_gender }
        });
      });
    }
    done(request, function () { say('Saved.'); }, form.querySelector('button[type=submit]'));
  }

  admin.start = function () {
    FT.api.root = FT.api.base(location.hostname);
    main = document.getElementById('main');
    main.addEventListener('click', onClick);
    main.addEventListener('submit', onSubmit);
    setInterval(tick, 1000);
    api().call('GET', '/me').then(function (me) {
      state.me = me;
      if (!me.is_admin) { main.innerHTML = '<p>Only admins can open this page.</p>'; return null; }
      var nav = document.getElementById('tabs');
      nav.innerHTML = visibleTabs().map(function (t) {
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
