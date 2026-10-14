(function (links) {
  var state = { tab: 'people', a: null, b: null, va: null, vb: null };
  var directory = [], villages = [], me = null;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function nameOf(p) { return p.name || p.name_hi || p.id; }

  links.matches = function (people, q, limit) {
    var needle = q.trim().toLowerCase();
    if (!needle) return [];
    var starts = [], inside = [];
    people.forEach(function (p) {
      var hay = [(p.name || '').toLowerCase(), (p.name_hi || '').toLowerCase()];
      if (hay.some(function (h) { return h.indexOf(needle) === 0; })) starts.push(p);
      else if (hay.some(function (h) { return h.indexOf(needle) > 0; })) inside.push(p);
    });
    return starts.concat(inside).slice(0, limit || 8);
  };

  links.sentence = function (result, meId) {
    if (!result.found) return 'No link found in the records.';
    var steps = result.steps;
    if (steps.length === 1) return 'That\'s the same person.';
    var a = steps[0], b = steps[steps.length - 1];
    var whose = a.id === meId ? 'your' : nameOf(a) + '\'s';
    var hi = result.summary.hi ? ' (' + result.summary.hi + ')' : '';
    return nameOf(b) + ' is ' + whose + ' ' + result.summary.en + hi + '.';
  };

  links.whoLine = function (p) {
    return [p.relation, p.village || 'Village not recorded'].filter(Boolean).join(' · ');
  };

  links.query = function (s) {
    var parts = ['tab=' + s.tab];
    var pair = s.tab === 'people' ? [s.a, s.b] : [s.va, s.vb];
    if (pair[0]) parts.push('a=' + encodeURIComponent(pair[0]));
    if (pair[1]) parts.push('b=' + encodeURIComponent(pair[1]));
    return '?' + parts.join('&');
  };

  function api() { return FT.api; }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function byId(id) {
    for (var i = 0; i < directory.length; i++) if (directory[i].id === id) return directory[i];
    return null;
  }

  function picker(slot, label, value, onPick) {
    var p = value && byId(value);
    slot.innerHTML = '<label class="lk-pick"><span>' + esc(label) + '</span>' +
      '<input type="search" autocomplete="off" placeholder="Type a name" value="' + esc(p ? nameOf(p) : '') + '">' +
      (p ? '<small>' + esc(links.whoLine(p)) + '</small>' : '') + '</label><div class="lk-results"></div>';
    var input = slot.querySelector('input');
    var results = slot.querySelector('.lk-results');
    input.addEventListener('input', function () {
      results.innerHTML = links.matches(directory, input.value).map(function (m) {
        return '<button type="button" data-id="' + esc(m.id) + '"><b>' + esc(nameOf(m)) + '</b> ' +
          (m.name && m.name_hi ? esc(m.name_hi) : '') + '<span>' + esc(links.whoLine(m)) + '</span></button>';
      }).join('');
    });
    results.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (b) onPick(b.getAttribute('data-id'));
    });
  }

  function villageSelect(label, value, blank) {
    return '<label class="lk-pick"><span>' + esc(label) + '</span><select>' +
      '<option value="">' + esc(blank) + '</option>' +
      villages.map(function (v) {
        return '<option value="' + esc(v.id) + '"' + (v.id === value ? ' selected' : '') + '>' + esc(v.name) + '</option>';
      }).join('') + '</select></label>';
  }

  function show(html) { document.getElementById('lk-result').innerHTML = html; }
  function fail(err) { show('<p class="lk-msg">' + esc(err.message) + '</p>'); }

  function sync() {
    history.replaceState(null, '', location.pathname + links.query(state));
    Array.prototype.forEach.call(document.querySelectorAll('#lk-tabs [data-tab]'), function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-tab') === state.tab ? 'page' : 'false');
    });
  }

  function renderPeople() {
    var form = document.getElementById('lk-form');
    form.innerHTML = '<div id="lk-a"></div><div id="lk-b"></div>';
    picker(document.getElementById('lk-a'), 'First person', state.a, function (id) { state.a = id; pickedPeople(); });
    picker(document.getElementById('lk-b'), 'Second person', state.b, function (id) { state.b = id; pickedPeople(); });
    sync();
    if (!state.a || !state.b) { show('<p class="lk-msg">Pick two people to see how they are linked.</p>'); return; }
    api().call('GET', '/links/people?a=' + encodeURIComponent(state.a) + '&b=' + encodeURIComponent(state.b))
      .then(function (r) {
        show('<p class="lk-summary">' + esc(links.sentence(r, me.id)) + '</p>' +
          (r.found && r.steps.length > 1
            ? '<a class="lk-go" href="./' + api().linkTreeUrl(state.a, state.b) + '">Show the link as a tree →</a>' : ''));
      }, fail);
  }

  function pickedPeople() {
    if (state.a && state.b && state.a !== state.b) {
      sync();
      location.assign('./' + api().linkTreeUrl(state.a, state.b));
      return;
    }
    renderPeople();
  }

  function personCard(p) {
    var life = p.life === 'deceased' ? 'Deceased' : p.life === 'living' ? 'Living' : '';
    return '<a class="lk-card ' + esc(p.gender || '') + '" href="./' + api().linkTreeUrl(me.id, p.id) + '">' +
      '<b>' + esc(nameOf(p)) + '</b>' + (p.name && p.name_hi ? '<span class="lk-hi">' + esc(p.name_hi) + '</span>' : '') +
      '<span class="lk-meta">' + esc([life, 'from ' + (p.village || 'village not recorded')].filter(Boolean).join(' · ')) + '</span>' +
      (p.relation ? '<span class="lk-rel">' + esc(p.relation) + '</span>' : '') + '</a>';
  }

  function coupleHtml(c) {
    return '<div class="lk-couple">' + personCard(c.husband) + '<span class="lk-married">married</span>' +
      personCard(c.wife) + '</div>';
  }

  function renderVillages() {
    var form = document.getElementById('lk-form');
    form.innerHTML = villageSelect('Village', state.va, 'Choose a village') +
      villageSelect('Linked to', state.vb, 'Any village');
    var selects = form.querySelectorAll('select');
    selects[0].addEventListener('change', function () { state.va = this.value || null; state.vb = null; renderVillages(); });
    selects[1].addEventListener('change', function () { state.vb = this.value || null; renderVillages(); });
    sync();
    if (!state.va) { show('<p class="lk-msg">Pick a village to see which villages it is linked to.</p>'); return; }
    if (!state.vb) {
      api().call('GET', '/villages/' + encodeURIComponent(state.va) + '/links').then(function (list) {
        show(list.length ? '<ul class="lk-list">' + list.map(function (v) {
          return '<li><button type="button" data-village="' + esc(v.village_id) + '">' + esc(v.village) +
            '</button> · ' + v.marriages + (v.marriages === 1 ? ' marriage' : ' marriages') + '</li>';
        }).join('') + '</ul>' : '<p class="lk-msg">No marriages with other villages are recorded.</p>');
      }, fail);
      return;
    }
    api().call('GET', '/links/villages?a=' + encodeURIComponent(state.va) + '&b=' + encodeURIComponent(state.vb))
      .then(function (r) {
        if (r.couples.length) { show('<div class="lk-couples">' + r.couples.map(coupleHtml).join('') + '</div>'); return; }
        if (!r.chain) { show('<p class="lk-msg">These villages are not linked in the records.</p>'); return; }
        show('<p class="lk-summary">No direct marriage. Linked through: ' +
          esc([r.chain[0].from.village].concat(r.chain.map(function (h) { return h.to.village; })).join(' → ')) +
          '</p><div class="lk-couples">' + r.chain.map(function (h) { return coupleHtml(h.couple); }).join('') + '</div>');
      }, fail);
  }

  function render() {
    if (state.tab === 'villages') renderVillages();
    else renderPeople();
  }

  links.start = function () {
    api().root = api().base(location.hostname);
    state.tab = param('tab') === 'villages' ? 'villages' : 'people';
    api().call('GET', '/me').then(function (who) {
      me = who;
      if (me.guest) { show('<p class="lk-msg">Guest logins cannot see links.</p>'); return null; }
      if (state.tab === 'villages') { state.va = param('a'); state.vb = param('b'); }
      else { state.a = param('a') || me.id; state.b = param('b'); }
      return Promise.all([api().call('GET', '/directory'), api().call('GET', '/villages')]).then(function (r) {
        directory = r[0];
        villages = r[1].slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
        document.getElementById('lk-tabs').addEventListener('click', function (e) {
          var b = e.target.closest('[data-tab]');
          if (!b) return;
          state.tab = b.getAttribute('data-tab');
          render();
        });
        document.getElementById('lk-result').addEventListener('click', function (e) {
          var b = e.target.closest('[data-village]');
          if (!b) return;
          state.vb = b.getAttribute('data-village');
          renderVillages();
        });
        render();
      });
    }).catch(function (err) {
      if (err.status === 401) location.assign('./');
      else fail(err);
    });
  };
})(typeof FT !== 'undefined' ? (FT.links = {}) : module.exports);
