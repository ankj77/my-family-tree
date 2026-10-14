(function (links) {
  var state = { va: null, vb: null };
  var villages = [], me = null;

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

  links.query = function (s) {
    var parts = [];
    if (s.va) parts.push('a=' + encodeURIComponent(s.va));
    if (s.vb) parts.push('b=' + encodeURIComponent(s.vb));
    return parts.length ? '?' + parts.join('&') : '';
  };

  function api() { return FT.api; }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
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

  function render() {
    var form = document.getElementById('lk-form');
    form.innerHTML = villageSelect('Village', state.va, 'Choose a village') +
      villageSelect('Linked to', state.vb, 'Any village');
    var selects = form.querySelectorAll('select');
    selects[0].addEventListener('change', function () { state.va = this.value || null; state.vb = null; render(); });
    selects[1].addEventListener('change', function () { state.vb = this.value || null; render(); });
    history.replaceState(null, '', location.pathname + links.query(state));
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

  links.start = function () {
    api().root = api().base(location.hostname);
    api().call('GET', '/me').then(function (who) {
      me = who;
      if (me.guest) { show('<p class="lk-msg">Guest logins cannot see links.</p>'); return null; }
      state.va = param('a');
      state.vb = param('b');
      return api().call('GET', '/villages').then(function (list) {
        villages = list.slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
        document.getElementById('lk-result').addEventListener('click', function (e) {
          var b = e.target.closest('[data-village]');
          if (!b) return;
          state.vb = b.getAttribute('data-village');
          render();
        });
        render();
      });
    }).catch(function (err) {
      if (err.status === 401) location.assign('./');
      else fail(err);
    });
  };
})(typeof FT !== 'undefined' ? (FT.links = {}) : module.exports);
