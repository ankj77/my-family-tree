(function (links) {
  var state = { a: null, b: null };
  var people = [], villages = [], me = null;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function nameOf(p) { return p.name || p.name_hi || p.id; }

  links.sentence = function (result, meId) {
    if (!result.found) return 'No link found in the records.';
    var steps = result.steps;
    if (steps.length === 1) return 'That\'s the same person.';
    var a = steps[0], b = steps[steps.length - 1];
    var whose = a.id === meId ? 'your' : nameOf(a) + '\'s';
    var hi = result.summary.hi ? ' (' + result.summary.hi + ')' : '';
    return nameOf(b) + ' is ' + whose + ' ' + result.summary.en + hi + '.';
  };

  links.parsePick = function (value) {
    if (!value) return null;
    var m = /^(p|v):(.+)$/.exec(value);
    return m ? { kind: m[1], id: m[2] } : { kind: 'p', id: value };
  };

  links.query = function (s) {
    var parts = [];
    if (s.a) parts.push('a=' + encodeURIComponent(s.a.kind + ':' + s.a.id));
    if (s.b) parts.push('b=' + encodeURIComponent(s.b.kind + ':' + s.b.id));
    return parts.length ? '?' + parts.join('&') : '';
  };

  links.matches = function (people, villages, q, limit) {
    var needle = q.trim().toLowerCase();
    if (!needle) return [];
    function rank(texts) {
      var best = null;
      texts.forEach(function (t) {
        var i = (t || '').toLowerCase().indexOf(needle);
        if (i >= 0 && (best === null || (i === 0 ? 0 : 1) < best)) best = i === 0 ? 0 : 1;
      });
      return best;
    }
    var hits = [];
    villages.forEach(function (v) {
      var r = rank([v.name]);
      if (r !== null) hits.push({ kind: 'v', item: v, rank: r });
    });
    people.forEach(function (p) {
      var r = rank([p.name, p.name_hi]);
      if (r !== null) hits.push({ kind: 'p', item: p, rank: r + 0.5 });
    });
    hits.sort(function (x, y) { return x.rank - y.rank; });
    return hits.slice(0, limit || 10);
  };

  links.who = function (p) {
    return [p.relation, p.village || 'Village not recorded'].filter(Boolean).join(' · ');
  };

  function api() { return FT.api; }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function item(pick) {
    return pick && find(pick.kind === 'v' ? villages : people, pick.id);
  }

  function pickText(pick) {
    var it = item(pick);
    if (!it) return '';
    return pick.kind === 'v' ? it.name + ' (village)' : nameOf(it) + ' ' + links.who(it);
  }

  function box(slot, label, key) {
    slot.innerHTML = '<label class="lk-pick"><span>' + esc(label) + '</span>' +
      '<input type="search" autocomplete="off" placeholder="Type a name or a village" value="' +
      esc(pickText(state[key])) + '"></label><div class="lk-results"></div>';
    var input = slot.querySelector('input');
    var results = slot.querySelector('.lk-results');
    input.addEventListener('focus', function () { input.select(); });
    input.addEventListener('input', function () {
      results.innerHTML = links.matches(people, villages, input.value).map(function (m) {
        var it = m.item;
        return '<button type="button" data-kind="' + m.kind + '" data-id="' + esc(it.id) + '">' +
          (m.kind === 'v'
            ? '<b>' + esc(it.name) + '</b> <span>Village</span>'
            : '<b>' + esc(nameOf(it)) + '</b> ' + (it.name && it.name_hi ? esc(it.name_hi) : '') +
              ' <span>' + esc(links.who(it)) + '</span>') + '</button>';
      }).join('');
    });
    results.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]');
      if (!b) return;
      state[key] = { kind: b.getAttribute('data-kind'), id: b.getAttribute('data-id') };
      render(true);
    });
  }

  function show(html) { document.getElementById('lk-result').innerHTML = html; }
  function fail(err) { show('<p class="lk-msg">' + esc(err.message) + '</p>'); }

  function personCard(p, href, extra) {
    var life = p.life === 'deceased' ? 'Deceased' : p.life === 'living' ? 'Living' : '';
    return '<a class="lk-card ' + esc(p.gender || '') + '" href="./' + href + '">' +
      (extra ? '<span class="lk-relation">' + esc(extra) + '</span>' : '') +
      '<b>' + esc(nameOf(p)) + '</b>' + (p.name && p.name_hi ? '<span class="lk-hi">' + esc(p.name_hi) + '</span>' : '') +
      '<span class="lk-meta">' + esc([life, 'from ' + (p.village || 'village not recorded')].filter(Boolean).join(' · ')) + '</span>' +
      (p.relation ? '<span class="lk-rel">' + esc(p.relation) + '</span>' : '') + '</a>';
  }

  function coupleHtml(c) {
    return '<div class="lk-couple">' + personCard(c.husband, api().linkTreeUrl(me.id, c.husband.id)) +
      '<span class="lk-married">married</span>' + personCard(c.wife, api().linkTreeUrl(me.id, c.wife.id)) + '</div>';
  }

  function villageLinks(vid) {
    api().call('GET', '/villages/' + encodeURIComponent(vid) + '/links').then(function (list) {
      show(list.length ? '<ul class="lk-list">' + list.map(function (v) {
        return '<li><button type="button" data-village="' + esc(v.village_id) + '">' + esc(v.village) +
          '</button> · ' + v.marriages + (v.marriages === 1 ? ' marriage' : ' marriages') + '</li>';
      }).join('') + '</ul>' : '<p class="lk-msg">No marriages with other villages are recorded.</p>');
    }, fail);
  }

  function villagePair(a, b) {
    api().call('GET', '/links/villages?a=' + encodeURIComponent(a) + '&b=' + encodeURIComponent(b)).then(function (r) {
      if (r.couples.length) { show('<div class="lk-couples">' + r.couples.map(coupleHtml).join('') + '</div>'); return; }
      if (!r.chain) { show('<p class="lk-msg">These villages are not linked in the records.</p>'); return; }
      show('<p class="lk-summary">No direct marriage. Linked through: ' +
        esc([r.chain[0].from.village].concat(r.chain.map(function (h) { return h.to.village; })).join(' → ')) +
        '</p><div class="lk-couples">' + r.chain.map(function (h) { return coupleHtml(h.couple); }).join('') + '</div>');
    }, fail);
  }

  function personVillage(pid, vid) {
    var person = find(people, pid), village = find(villages, vid);
    api().call('GET', '/links/person-village?a=' + encodeURIComponent(pid) + '&v=' + encodeURIComponent(vid))
      .then(function (list) {
        if (!list.length) { show('<p class="lk-msg">No one from ' + esc(village.name) + ' is linked to ' + esc(nameOf(person)) + ' in the records.</p>'); return; }
        var whose = pid === me.id ? 'your' : nameOf(person) + '\'s';
        show('<p class="lk-summary">' + list.length + (list.length === 1 ? ' person' : ' people') + ' from ' +
          esc(village.name) + ' linked to ' + esc(nameOf(person)) + ', closest first. Tap one to see the chart.</p>' +
          '<div class="lk-grid">' + list.map(function (p) {
            var rel = whose + ' ' + p.summary.en + (p.summary.hi ? ' (' + p.summary.hi + ')' : '');
            return personCard(p, api().linkTreeUrl(pid, p.id), rel);
          }).join('') + '</div>');
      }, fail);
  }

  function render(picked) {
    var form = document.getElementById('lk-form');
    form.innerHTML = '<div id="lk-a"></div><div id="lk-b"></div>';
    box(document.getElementById('lk-a'), 'First: person or village', 'a');
    box(document.getElementById('lk-b'), 'Second: person or village', 'b');
    history.replaceState(null, '', location.pathname + links.query(state));
    var a = state.a, b = state.b;
    if (a && b && a.kind === 'p' && b.kind === 'p') {
      if (picked) { location.assign('./' + api().linkTreeUrl(a.id, b.id)); return; }
      show('<a class="lk-go" href="./' + api().linkTreeUrl(a.id, b.id) + '">Show the link chart →</a>');
      return;
    }
    if (a && b && a.kind === 'v' && b.kind === 'v') { villagePair(a.id, b.id); return; }
    if (a && b) { var p = a.kind === 'p' ? a : b, v = a.kind === 'v' ? a : b; personVillage(p.id, v.id); return; }
    var only = a || b;
    if (only && only.kind === 'v') { villageLinks(only.id); return; }
    show('<p class="lk-msg">Pick two: two people, two villages, or a person and a village.</p>');
  }

  links.start = function () {
    api().root = api().base(location.hostname);
    api().call('GET', '/me').then(function (who) {
      me = who;
      if (me.guest) { show('<p class="lk-msg">Guest logins cannot see links.</p>'); return null; }
      state.a = links.parsePick(param('a')) || { kind: 'p', id: me.id };
      state.b = links.parsePick(param('b'));
      return Promise.all([api().call('GET', '/directory'), api().call('GET', '/villages')]).then(function (r) {
        people = r[0];
        villages = r[1].slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
        document.getElementById('lk-result').addEventListener('click', function (e) {
          var b = e.target.closest('[data-village]');
          if (!b) return;
          var other = { kind: 'v', id: b.getAttribute('data-village') };
          if (state.a) state.b = other;
          else state.a = other;
          render(false);
        });
        render(false);
      });
    }).catch(function (err) {
      if (err.status === 401) location.assign('./');
      else fail(err);
    });
  };
})(typeof FT !== 'undefined' ? (FT.links = {}) : module.exports);
