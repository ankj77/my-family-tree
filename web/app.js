var FT = { views: {} };
(function () {
  var NS="http://www.w3.org/2000/svg";
  var tree=JSON.parse(document.getElementById('tree-data').textContent);
  var unlinked=JSON.parse(document.getElementById('unlinked-data').textContent);
  var summary=JSON.parse(document.getElementById('summary-data').textContent);
  var vp=document.getElementById('viewport');
  var stage=document.getElementById('stage');

  function el(tag, attrs, parent){
    var e=document.createElementNS(NS, tag);
    for(var k in attrs){ e.setAttribute(k, attrs[k]); }
    if(parent) parent.appendChild(e);
    return e;
  }

  FT.el = el;

  FT.edge = function (g, d, childId) {
    var attrs = { 'class': 'edge', d: d };
    if (childId) attrs['data-edge'] = childId;
    return el('path', attrs, g);
  };

  FT.CARD_W = 250; FT.ROW_H = 52; FT.RAIL_W = 5; FT.AVATAR = 32;
  FT.H_GAP = 40; FT.V_GAP = 100;

  FT.state = { lang: 'en', viewId: 'classic', collapsed: {}, grown: {}, only: null, picks: [], selected: null, highlighted: null };
  FT.OPEN_DEPTH = 4;
  FT.state.depthCap = null;
  FT.nodes = []; FT.byId = {}; FT.parentOf = {};

  (function walk(n, parent) {
    FT.nodes.push(n);
    FT.byId[n.id] = n;
    if (parent) FT.parentOf[n.id] = parent;
    (n.children || []).forEach(function (c) { walk(c, n); });
  })(tree, null);

  FT.depthOf = function (id) {
    var d = 0, c = FT.parentOf[id];
    while (c) { d++; c = FT.parentOf[c.id]; }
    return d;
  };

  FT.treeDepth = function () {
    var deepest = 0;
    FT.nodes.forEach(function (n) {
      var d = FT.depthOf(n.id);
      if (d > deepest) deepest = d;
    });
    return deepest;
  };

  FT.viewCap = function () {
    var view = FT.views[FT.state.viewId];
    return view && view.maxDepth !== undefined ? view.maxDepth : Infinity;
  };

  FT.revealDepth = function (d) {
    if (FT.maxDepth() < d) FT.state.depthCap = d;
  };

  FT.hasPartner = function (n) {
    return (n.spouses && n.spouses.length > 0) || !!n.placeholder;
  };
  FT.partners = function (n) {
    if (n.spouses && n.spouses.length) return n.spouses;
    if (n.placeholder) return [{ id: null, placeholder: true, gender: n.placeholder }];
    return [];
  };
  FT.hash01 = function (s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  };
  FT.quadAt = function (x1, y1, mx, my, x2, y2) {
    return function (t) {
      var u = 1 - t;
      return { x: u * u * x1 + 2 * u * t * mx + t * t * x2,
               y: u * u * y1 + 2 * u * t * my + t * t * y2 };
    };
  };

  FT.cubicAt = function (x1, y1, ax, ay, bx, by, x2, y2) {
    return function (t) {
      var u = 1 - t;
      return { x: u*u*u*x1 + 3*u*u*t*ax + 3*u*t*t*bx + t*t*t*x2,
               y: u*u*u*y1 + 3*u*u*t*ay + 3*u*t*t*by + t*t*t*y2 };
    };
  };

  FT.leaves = function (g, id, at, count, scale) {
    var ramp = ['var(--leaf-1)', 'var(--leaf-2)', 'var(--leaf-3)'];
    for (var k = 0; k < count; k++) {
      var h = FT.hash01(id + 'leaf' + k);
      var t = 0.18 + (k / count) * 0.74 + h * 0.06;
      var p = at(t);
      var side = k % 2 ? 1 : -1;
      var off = (11 + h * 13) * scale;
      var lx = p.x + side * off;
      var ly = p.y + (h - 0.5) * 16 * scale;
      var e = FT.el('ellipse', {
        'class': 'poster-leaf',
        cx: lx, cy: ly,
        rx: (12 + h * 6) * scale, ry: (6.5 + h * 3) * scale,
        transform: 'rotate(' + (side * (25 + h * 50) - 20) + ',' + lx + ',' + ly + ')'
      }, g);
      e.style.fill = ramp[(k + Math.floor(h * 3)) % ramp.length];
    }
  };

  FT.limb = function (g, id, d, at, thickness) {
    var p = FT.edge(g, d, id);
    p.setAttribute('class', 'edge branch');
    p.style.strokeWidth = thickness + 'px';
    FT.leaves(g, id, at, 2, 0.62);
    return p;
  };

  FT.limbWeight = function (n) {
    return Math.max(2.2, Math.sqrt(FT.leafCount(n)) * 1.7);
  };

  FT.leafCount = function (n) {
    var kids = FT.visibleChildren(n);
    if (!kids.length) return 1;
    return kids.reduce(function (sum, c) { return sum + FT.leafCount(c); }, 0);
  };
  FT.rows = function (n) {
    var partners = FT.partners(n).length;
    return 1 + partners;
  };
  FT.COUPLE_GAP = 44;
  FT.spouseOf = function (n) { return (n.spouses || [])[0] || null; };
  FT.nodeW = function (n) {
    return FT.spouseOf(n) ? 2 * FT.CARD_W + FT.COUPLE_GAP : FT.CARD_W;
  };
  FT.nodeH = function (n) {
    var view = FT.views[FT.state.viewId];
    if (view && view.cardStyle === 'parents') return FT.cardH(n, 2);
    return FT.rows(n) * FT.ROW_H;
  };
  FT.jointX = function (n) {
    return FT.spouseOf(n) ? FT.CARD_W + FT.COUPLE_GAP / 2 : FT.CARD_W / 2;
  };
  FT.jointY = function (n) { return FT.spouseOf(n) ? FT.nodeH(n) / 2 : FT.nodeH(n); };

  FT.kidsAt = function (n, depth) {
    if (depth >= FT.maxDepth() && !FT.state.grown[n.id]) return [];
    return FT.visibleChildren(n);
  };

  FT.toggleKids = function (n, depth) {
    if (FT.kidsAt(n, depth).length) {
      FT.state.collapsed[n.id] = true;
    } else {
      FT.state.collapsed[n.id] = false;
      FT.state.grown[n.id] = true;
      var only = FT.state.only;
      if (only) (n.children || []).forEach(function (c) { only[c.id] = true; });
    }
    FT.render();
  };

  FT.visibleChildren = function (n) {
    if (FT.state.collapsed[n.id]) return [];
    var kids = n.children || [];
    var only = FT.state.only;
    if (!only) return kids;
    return kids.filter(function (c) { return only[c.id]; });
  };

  FT.place = function (p) {
    var a = p.address || {};
    return a.locality || a.city || a.state || a.country || '';
  };

  FT.metaLine = function (p) {
    var parts = [];
    var span = FT.lifespan(p);
    if (span) parts.push(span);
    var place = FT.place(p);
    if (place) parts.push(place);
    var village = (p.origin || {}).village;
    if (village) parts.push('from ' + village);
    return { text: parts.join(' · '), dot: !FT.isDeceased(p) && p.life === 'living' };
  };

  FT.isDeceased = function (p) {
    return !!(p.died || p.life === 'deceased');
  };

  FT.lifespan = function (p) {
    if (p.born && p.died) return p.born + '–' + p.died;
    if (p.born && p.life === 'deceased') return p.born + '–Deceased';
    if (p.born && p.life === 'living') return p.born + '–Living';
    if (p.born) return 'b. ' + p.born;
    if (p.died) return 'd. ' + p.died;
    if (p.life === 'living') return 'Living';
    if (p.life === 'deceased') return 'Deceased';
    return '';
  };

  FT.label = function (p) {
    return FT.state.lang === 'hi'
      ? [p.name_hi || p.name || p.id]
      : [p.name || p.name_hi || p.id];
  };

  var ADDRESS_ROWS = [
    ['line', 'Address'], ['locality', 'Locality'], ['city', 'City'],
    ['state', 'State'], ['country', 'Country']
  ];

  function norm(s) { return (s || '').trim().toLowerCase(); }

  FT.originText = function (p) {
    var o = p.origin || {};
    return [o.village, o.district, o.state].filter(Boolean).join(', ');
  };

  FT.sameVillage = function (a, b) {
    var x = a.origin || {}, y = b.origin || {};
    if (!norm(x.village) || norm(x.village) !== norm(y.village)) return false;
    return !x.state || !y.state || norm(x.state) === norm(y.state);
  };

  function villageRefs(p) {
    var refs = [];
    FT.nodes.forEach(function (n) {
      if (n.id !== p.id && FT.sameVillage(p, n)) refs.push(personRef(n.id));
      (n.spouses || []).forEach(function (s) {
        if (s.id !== p.id && FT.sameVillage(p, s)) refs.push(spouseRef(s, n));
      });
    });
    return refs;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function personRef(id) {
    var n = FT.byId[id];
    var label = n ? (FT.label(n)[0]) : id;
    return '<a href="#" data-goto="' + esc(id) + '">' + esc(label) + '</a>';
  }

  function spouseRef(s, owner) {
    return '<a href="#" data-spouse="' + esc(s.id) + '" data-owner="' + esc(owner.id) + '">' +
      esc(FT.label(s)[0]) + '</a>';
  }

  function sheetHtml(p, owner) {
    var h = '';
    if (p.photo) h += '<img class="sheet-photo" src="' + esc(p.photo) + '" alt="">';
    if (p.name) h += '<h3>' + esc(p.name) + '</h3>';
    if (p.name_hi) h += '<p class="sheet-hi">' + esc(p.name_hi) + '</p>';
    var rows = '';
    if (p.father) rows += '<dt>Father</dt><dd>' + esc(p.father) + '</dd>';
    if (p.born) rows += '<dt>Born</dt><dd>' + esc(p.born) + '</dd>';
    if (p.died) rows += '<dt>Died</dt><dd>' + esc(p.died) + '</dd>';
    if (p.life || p.died) {
      rows += '<dt>Status</dt><dd>' +
        (FT.isDeceased(p) ? 'Deceased' : 'Living') + '</dd>';
    }
    ADDRESS_ROWS.forEach(function (r) {
      var v = (p.address || {})[r[0]];
      if (v) rows += '<dt>' + r[1] + '</dt><dd>' + esc(v) + '</dd>';
    });
    var origin = FT.originText(p);
    if (origin) {
      rows += '<dt>Origin</dt><dd>' + esc(origin) +
        (p.origin_inherited ? ' <em>(family line)</em>' : '') + '</dd>';
    }
    if (p.note) rows += '<dt>Note</dt><dd>' + esc(p.note) + '</dd>';
    if (rows) h += '<dl>' + rows + '</dl>';

    var rel = '';
    var parent = p === owner ? FT.parentOf[owner.id] : null;
    if (parent) rel += '<div><span>Parent</span> ' + personRef(parent.id) + '</div>';
    if (p !== owner) {
      rel += '<div><span>Spouse</span> ' + personRef(owner.id) + '</div>';
    } else if (owner.spouses && owner.spouses.length) {
      rel += '<div><span>Spouse</span> ' +
        owner.spouses.map(function (s) { return spouseRef(s, owner); }).join(', ') + '</div>';
    } else if (owner.placeholder) {
      rel += '<div><span>Spouse</span> <em>not recorded</em></div>';
    }
    var kids = owner.children || [];
    if (kids.length) {
      rel += '<div><span>Children</span> ' +
        kids.map(function (c) { return personRef(c.id); }).join(', ') + '</div>';
    }
    var village = villageRefs(p);
    if (village.length) {
      rel += '<div><span>Same village</span> ' + village.join(', ') + '</div>';
    }
    if (rel) h += '<div class="sheet-rel">' + rel + '</div>';
    return h;
  }

  var sheet = document.getElementById('sheet');
  var sheetBody = document.getElementById('sheet-body');

  FT.closeSheet = function () {
    sheet.classList.add('hidden');
    FT.state.selected = null;
    FT.state.highlighted = null;
  };

  FT.select = function (id, owner) {
    var node = owner || FT.byId[id];
    if (!node) return;
    var person = node.id === id ? node :
      (node.spouses || []).filter(function (s) { return s.id === id; })[0] || node;
    FT.state.selected = id;
    FT.state.highlighted = node.id;
    highlight(node.id);
    sheetBody.innerHTML = sheetHtml(person, node);
    sheet.style.borderLeftColor = person.gender === 'female' ? 'var(--rail-f)' :
      person.gender === 'male' ? 'var(--rail-m)' : 'var(--rail-unknown)';
    sheet.classList.remove('hidden');
  };

  FT.lineage = function (id) {
    var keep = {};
    var n = FT.byId[id];
    while (n) { keep[n.id] = true; n = FT.parentOf[n.id]; }
    return keep;
  };

  FT.MAX_PICKS = 3;

  FT.commonAncestor = function (ids) {
    if (!ids.length) return null;
    var common = FT.lineage(ids[0]);
    ids.slice(1).forEach(function (id) {
      var line = FT.lineage(id);
      Object.keys(common).forEach(function (k) { if (!line[k]) delete common[k]; });
    });
    var best = null;
    Object.keys(common).forEach(function (k) {
      if (best === null || FT.depthOf(k) > FT.depthOf(best)) best = k;
    });
    return best;
  };

  FT.FOCUS_SCALE = 0.85;

  FT.focus = function (id) {
    if (FT.state.picks.indexOf(id) < 0) FT.state.picks = [id];
    FT.showPicks();
  };

  FT.clearPicks = function () {
    FT.state.picks = [];
    FT.state.place = null;
    FT.state.only = null;
    if (FT.renderPicks) FT.renderPicks();
  };

  FT.showPicks = function () {
    FT.state.place = null;
    var ids = FT.state.picks.filter(function (id) { return FT.byId[id]; });
    FT.state.picks = ids;
    FT.renderPicks();
    if (!ids.length) { FT.state.only = null; FT.render(); FT.fit(); return; }
    var keep = {}, deepest = 0;
    ids.forEach(function (id) {
      var line = FT.lineage(id);
      Object.keys(line).forEach(function (k) { keep[k] = true; });
      deepest = Math.max(deepest, FT.depthOf(id));
    });
    FT.state.only = keep;
    FT.state.collapsed = {};
    FT.revealDepth(deepest + 1);
    FT.render();
    if (ids.length > 1) { FT.fit(); FT.closeSheet(); return; }
    var n = FT.byId[ids[0]];
    var r = stage.getBoundingClientRect();
    scale = Math.max(scale, FT.FOCUS_SCALE);
    tx = r.width / 2 - (n.x + FT.jointX(n)) * scale;
    ty = r.height / 2 - n.y * scale;
    apply();
    FT.select(ids[0], n);
  };

  document.getElementById('sheet-close').addEventListener('click', FT.closeSheet);
  sheetBody.addEventListener('click', function (e) {
    var sp = e.target.closest('[data-spouse]');
    if (sp) {
      e.preventDefault();
      var owner = FT.byId[sp.getAttribute('data-owner')];
      if (owner) FT.select(sp.getAttribute('data-spouse'), owner);
      return;
    }
    var a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    FT.focus(a.getAttribute('data-goto'));
  });

  function fitText(t, avail) {
    var full = t.getComputedTextLength();
    if (full <= avail) return;
    var s = t.textContent;
    var keep = Math.max(1, Math.floor(s.length * avail / full) - 1);
    t.textContent = s.slice(0, keep) + '…';
    while (keep > 1 && t.getComputedTextLength() > avail) {
      keep -= 1;
      t.textContent = s.slice(0, keep) + '…';
    }
  }

  function drawRow(parent, p, rowIndex, owner) {
    var y = rowIndex * FT.ROW_H;
    var unfilled = !p.id;
    var cls = 'card-row' + (unfilled ? ' unfilled' : '') +
      (FT.isDeceased(p) ? ' deceased' : '') +
      (p.status === 'uncertain' ? ' uncertain' : '');
    var g = el('g', { 'class': cls, transform: 'translate(0,' + y + ')' }, parent);
    el('rect', {
      'class': 'card-hit', x: 0, y: 0, width: FT.CARD_W, height: FT.ROW_H
    }, g);
    el('rect', {
      'class': 'card-rail', x: 0, y: 0, width: FT.RAIL_W, height: FT.ROW_H,
      fill: unfilled ? 'var(--rail-unknown)'
        : (p.gender === 'female' ? 'var(--rail-f)' : 'var(--rail-m)')
    }, g);
    var textX = FT.RAIL_W + 12;
    if (p.photo) {
      var img = el('image', {
        href: p.photo, x: textX, y: (FT.ROW_H - FT.AVATAR) / 2,
        width: FT.AVATAR, height: FT.AVATAR,
        preserveAspectRatio: 'xMidYMid slice',
        'clip-path': 'inset(0 round 50%)', 'class': 'avatar'
      }, g);
      img.addEventListener('error', function () { g.removeChild(img); });
      textX += FT.AVATAR + 10;
    }
    var placeholder = unfilled ? FT.placeholderName(owner, p.gender) : null;
    var name = el('text', { 'class': 'card-name', x: textX, y: 21 }, g);
    name.textContent = placeholder ? placeholder[0] : FT.label(p)[0];
    fitText(name, FT.CARD_W - textX - 10);
    var meta = placeholder
      ? { text: placeholder[1] || '', dot: false }
      : FT.metaLine(p);
    if (meta.dot) {
      el('circle', { 'class': 'living-dot', cx: textX + 3, cy: 34, r: 3 }, g);
    }
    if (meta.text) {
      var metaX = textX + (meta.dot ? 12 : 0);
      var m = el('text', { 'class': 'card-meta', x: metaX, y: 38 }, g);
      m.textContent = meta.text;
      fitText(m, FT.CARD_W - metaX - 10);
    }
    if (!unfilled) {
      g.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FT.select(p.id, owner);
      });
    }
    return g;
  }

  FT.parentsOf = function (n) {
    var p = FT.parentOf[n.id];
    if (!p) return { father: null, mother: null };
    var spouse = (p.spouses && p.spouses.length) ? p.spouses[0] : null;
    if (p.gender === 'female') return { mother: p, father: spouse };
    return { father: p, mother: spouse };
  };

  var SILHOUETTE = {
    male: [
      ['circle', { cx: 0, cy: -3, r: 3.7 }],
      ['ellipse', { 'class': 'pc-icon-cut', cx: 0, cy: -2.1, rx: 2.8, ry: 2.9 }],
      ['path', { d: 'M-6.8,8.4 C-6.8,3.8 -3.8,1.8 0,1.8 C3.8,1.8 6.8,3.8 6.8,8.4 Z' }],
      ['path', { 'class': 'pc-icon-cut', d: 'M-1.7,1.9 L0,4.6 L1.7,1.9 Z' }]
    ],
    female: [
      ['circle', { cx: 0, cy: -7.8, r: 1.9 }],
      ['path', { d: 'M-3.9,-3 C-3.9,-7.8 3.9,-7.8 3.9,-3 L4.5,2.6 L-4.5,2.6 Z' }],
      ['ellipse', { 'class': 'pc-icon-cut', cx: 0, cy: -2.2, rx: 2.5, ry: 2.9 }],
      ['path', { d: 'M-6.2,8.4 C-6.2,4.8 -3.4,2.8 0,2.8 C3.4,2.8 6.2,4.8 6.2,8.4 Z' }]
    ]
  };

  function personIcon(g, cx, cy, gender, scale) {
    var tint = gender === 'female' ? 'var(--rail-f)' : 'var(--rail-m)';
    var icon = el('g', {
      transform: 'translate(' + cx + ',' + cy + ') scale(' + (scale || 1) + ')'
    }, g);
    var bg = el('circle', { 'class': 'pc-icon-bg', r: 9 }, icon);
    bg.style.fill = tint;
    SILHOUETTE[gender === 'female' ? 'female' : 'male'].forEach(function (part) {
      var attrs = { 'class': part[1]['class'] || 'pc-icon-fg' };
      Object.keys(part[1]).forEach(function (k) { if (k !== 'class') attrs[k] = part[1][k]; });
      var shape = el(part[0], attrs, icon);
      if (attrs['class'] === 'pc-icon-fg') shape.style.fill = tint;
    });
  }

  var PETAL = 'M0,6 C-4.2,1 -3.8,-6 0,-10 C3.8,-6 4.2,1 0,6 Z';
  var LEAF = 'M0,8 C-6.5,3 -6,-5 0,-10 C6,-5 6.5,3 0,8 Z';

  function genderMotif(g, cx, cy, gender) {
    var m = el('g', {
      'class': 'pc-motif ' + gender, transform: 'translate(' + cx + ',' + cy + ')'
    }, g);
    if (gender === 'female') {
      [-64, -32, 0, 32, 64].forEach(function (a) {
        el('path', { 'class': Math.abs(a) > 40 ? 'petal outer' : 'petal', d: PETAL,
          transform: 'rotate(' + a + ' 0 6)' }, m);
      });
      el('path', { 'class': 'motif-line', d: 'M-10,8 Q0,12 10,8' }, m);
      return;
    }
    el('path', { 'class': 'motif-line', d: 'M-2,11 Q0,2 0,-4' }, m);
    [[-38, -4, 2], [34, 5, -1]].forEach(function (l) {
      var t = 'translate(' + l[1] + ',' + l[2] + ') rotate(' + l[0] + ') scale(0.85)';
      el('path', { 'class': 'leaf', d: LEAF, transform: t }, m);
      el('path', { 'class': 'vein', d: 'M0,7 L0,-8', transform: t }, m);
    });
  }

  var ROPE = ['#F29A2E', '#E3801C', '#F7B04A'];

  function rose(m, x, y, r) {
    [[-r * 0.7, 0], [r * 0.7, 0], [0, -r * 0.6]].forEach(function (d) {
      el('circle', { 'class': 'rose', cx: x + d[0], cy: y + d[1], r: r }, m);
    });
    el('circle', { 'class': 'rose-core', cx: x, cy: y - r * 0.2, r: r * 0.45 }, m);
  }

  function garland(g, top, H, knob) {
    var W = FT.CARD_W, y0 = top + 4, side = top + H - 14, dip = top + H + 20;
    var m = el('g', { 'class': 'garland' }, g);
    var rope = el('path', { 'class': 'garland-rope',
      d: 'M0,' + y0 + ' L-1,' + side + ' C-1,' + dip + ' ' + (W + 1) + ',' + dip + ' ' +
         (W + 1) + ',' + side + ' L' + W + ',' + y0 }, m);
    var len = rope.getTotalLength();
    function at(f) { var p = rope.getPointAtLength(f * len); return [p.x, p.y]; }
    var CURLS = 90;
    for (var i = 0; i <= CURLS; i++) {
      var p = at(i / CURLS), q = at(Math.min(1, i / CURLS + 0.005));
      var tilt = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI + (i % 2 ? 35 : -35);
      var curl = el('ellipse', { 'class': 'curl', cx: 0, cy: 0, rx: 4.2, ry: 3,
        transform: 'translate(' + p[0] + ',' + p[1] + ') rotate(' + tilt + ') translate(0,' + (i % 2 ? -2 : 2) + ')' }, m);
      curl.style.fill = ROPE[i % 3];
    }
    [0.22, 0.78].forEach(function (f) { var p = at(f); rose(m, p[0], p[1], 3.8); });
    var low = at(0.5)[1];
    [6, 11].forEach(function (d, i) {
      var k = el('ellipse', { 'class': 'curl', cx: W / 2, cy: low + d, rx: 4.6, ry: 3.4 }, m);
      k.style.fill = ROPE[i];
    });
    el('path', { 'class': 'leaf', d: LEAF, transform: 'translate(' + (W / 2 - 5) + ',' + (low + 17) + ') rotate(-60) scale(0.45)' }, m);
    el('path', { 'class': 'leaf', d: LEAF, transform: 'translate(' + (W / 2 + 5) + ',' + (low + 17) + ') rotate(60) scale(0.45)' }, m);
    rose(m, W / 2, low + 18, 3.4);
    if (knob && Math.abs(knob.x - W / 2) < 30 && knob.y > top + H - 10) knob.y = top + H + 50;
  }

  FT.knob = function (g, n, cx, cy) {
    var hit = el('circle', { 'class': 'toggle-hit', cx: cx, cy: cy, r: 22 }, g);
    el('circle', { 'class': 'toggle', cx: cx, cy: cy, r: 10 }, g);
    var sign = el('text', {
      'class': 'toggle-sign', x: cx, y: cy + 5, 'text-anchor': 'middle'
    }, g);
    sign.textContent = FT.kidsAt(n, n.depth || 0).length ? '\u2212' : '+';
    hit.addEventListener('click', function (ev) {
      ev.stopPropagation();
      FT.toggleKids(n, n.depth || 0);
    });
  };

  FT.cardH = function (p, rows) {
    return 44 + rows * 30 + (FT.metaLine(p).text ? 16 : 0);
  };

  function spouseWord(s) {
    return s.gender === 'female' ? 'Wife' : s.gender === 'male' ? 'Husband' : 'Spouse';
  }

  function cardFace(g, p, H, rows, valueRoom) {
    el('rect', { 'class': 'card-shadow', x: 0, y: 3, width: FT.CARD_W, height: H, rx: 10 }, g);
    el('rect', { 'class': 'card-bg', width: FT.CARD_W, height: H, rx: 10 }, g);
    el('rect', { 'class': 'card-hit', width: FT.CARD_W, height: H }, g);
    var title = el('text', {
      'class': 'pc-name', x: FT.CARD_W / 2, y: 26, 'text-anchor': 'middle'
    }, g);
    title.textContent = FT.label(p)[0];
    fitText(title, FT.CARD_W - 84);
    if (p.gender) {
      personIcon(g, 22, 21, p.gender, 1.3);
      genderMotif(g, FT.CARD_W - 22, 21, p.gender);
    }
    var meta = FT.metaLine(p);
    var drop = 0;
    if (meta.text) {
      var sub = el('text', {
        'class': 'pc-sub', x: FT.CARD_W / 2, y: 42, 'text-anchor': 'middle'
      }, g);
      sub.textContent = meta.text;
      fitText(sub, FT.CARD_W - 24);
      drop = 16;
    }
    el('line', {
      'class': 'pc-rule', x1: 18, y1: 38 + drop, x2: FT.CARD_W - 18, y2: 38 + drop
    }, g);
    rows.forEach(function (row, i) {
      var y = 58 + drop + i * 30;
      personIcon(g, 32, y, row[2]);
      var lab = el('text', { 'class': 'pc-label', x: 52, y: y - 3 }, g);
      lab.textContent = row[0];
      var val = el('text', { 'class': 'pc-value', x: 52, y: y + 11 }, g);
      val.textContent = row[1] ? FT.label(row[1])[0] : '(Unknown)';
      fitText(val, valueRoom(i));
    });
  }

  function gapCard(g, n, H) {
    el('rect', { 'class': 'gap-bg', width: FT.CARD_W, height: H, rx: 10 }, g);
    var t = el('text', { 'class': 'pc-name', x: FT.CARD_W / 2, y: H / 2 - 4, 'text-anchor': 'middle' }, g);
    t.textContent = FT.label(n)[0];
    var sub = el('text', { 'class': 'pc-sub', x: FT.CARD_W / 2, y: H / 2 + 16, 'text-anchor': 'middle' }, g);
    sub.textContent = 'names not yet recorded';
    g.addEventListener('click', function () { FT.select(n.id, n); });
  }

  FT.drawParentCard = function (parent, n) {
    var g = el('g', {
      'class': 'card parent-card' + (n.gender ? ' ' + n.gender : ''), 'data-id': n.id,
      transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    var H = FT.cardH(n, 2);
    if (n.status === 'gap') {
      gapCard(g, n, H);
      var gv = FT.views[FT.state.viewId];
      var gat = gv && gv.togglePos ? gv.togglePos(n) : { x: FT.jointX(n), y: -12 };
      if ((n.children || []).length && !FT.state.place) FT.knob(g, n, gat.x, gat.y);
      return g;
    }
    var main = el('g', {}, g);
    var pr = FT.parentsOf(n);
    cardFace(main, n, H, [['Father', pr.father, 'male'], ['Mother', pr.mother, 'female']],
      function () { return FT.CARD_W - 66; });
    main.addEventListener('click', function () { FT.select(n.id, n); });

    var sp = FT.spouseOf(n);
    var spX = FT.CARD_W + FT.COUPLE_GAP;
    if (sp) {
      el('line', { 'class': 'spouse-link', x1: FT.CARD_W, y1: H / 2, x2: spX, y2: H / 2 }, g);
      var sg = el('g', { 'class': 'spouse-card ' + (sp.gender || ''),
        transform: 'translate(' + spX + ',0)' }, g);
      cardFace(sg, sp, H, [['Father', sp.father ? { name: sp.father } : null, 'male'],
        [spouseWord(sp) + ' of', n, n.gender]],
        function () { return FT.CARD_W - 66; });
      sg.addEventListener('click', function (ev) { ev.stopPropagation(); FT.select(sp.id, n); });
    }

    var hasKids = (n.children || []).length > 0 && !FT.state.place;
    var view = FT.views[FT.state.viewId];
    var at = view && view.togglePos ? view.togglePos(n) : { x: FT.jointX(n), y: -12 };
    if (FT.isDeceased(n)) garland(g, 0, H, at);
    if (sp && FT.isDeceased(sp)) {
      var sgl = el('g', { transform: 'translate(' + spX + ',0)' }, g);
      garland(sgl, 0, H, null);
    }
    if (hasKids) FT.knob(g, n, at.x, at.y);
    return g;
  };

  FT.ROOT_ART_LEN = 350;
  FT.ROOT_SCALE = 0.5;

  FT.rootArt = function (parent, transform, groundSpin) {
    var g = el('g', { 'class': 'root-art', transform: transform }, parent);
    var ground = { 'class': 'poster-ground', cx: 0, cy: 24, rx: 430, ry: 52 };
    if (groundSpin) ground.transform = groundSpin;
    el('ellipse', ground, g);
    [-1, 1].forEach(function (dir) {
      for (var i = 1; i <= 4; i++) {
        var h = FT.hash01('root' + dir + i);
        var reach = dir * (70 + i * 62 + h * 40);
        var drop = 120 + i * 34 + h * 40;
        var r = el('path', {
          'class': 'poster-root',
          d: 'M0,-10 C' + (reach * 0.35) + ',14 ' +
             (reach * 0.95) + ',' + (drop * 0.35) + ' ' + reach + ',' + drop
        }, g);
        r.style.strokeWidth = Math.max(2.5, 12 - i * 2.1) + 'px';
      }
    });
    var bw = 44, tw = 13, top = -FT.ROOT_ART_LEN;
    el('path', {
      'class': 'poster-trunk',
      d: 'M' + (-bw) + ',30 C' + (-bw * 0.55) + ',-90 ' +
         (-tw * 2.6) + ',' + (top + 170) + ' ' + (-tw) + ',' + top +
         ' L' + tw + ',' + top +
         ' C' + (tw * 2.6) + ',' + (top + 170) + ' ' +
         (bw * 0.55) + ',-90 ' + bw + ',30 Z'
    }, g);
    return g;
  };

  FT.drawNode = function (parent, n) {
    var view = FT.views[FT.state.viewId];
    if (view && view.cardStyle === 'parents') return FT.drawParentCard(parent, n);
    var g = el('g', {
      'class': 'card', 'data-id': n.id,
      transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    el('rect', {
      'class': 'card-shadow', y: 3, width: FT.CARD_W, height: FT.nodeH(n), rx: 8
    }, g);
    el('rect', {
      'class': 'card-bg', width: FT.CARD_W, height: FT.nodeH(n), rx: 8
    }, g);
    drawRow(g, n, 0, n);
    FT.partners(n).forEach(function (p, i) { drawRow(g, p, i + 1, n); });
    if ((n.children || []).length) {
      var tview = FT.views[FT.state.viewId];
      var at = tview && tview.togglePos ? tview.togglePos(n)
        : { x: FT.jointX(n), y: FT.jointY(n) + 8 };
      FT.knob(g, n, at.x, at.y);
    }
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.maxDepth = function () {
    if (FT.state.depthCap !== null) return FT.state.depthCap;
    return FT.viewCap();
  };

  FT.render = function () {
    while (vp.firstChild) vp.removeChild(vp.firstChild);
    var view = FT.views[FT.state.viewId] || FT.views.classic;
    var owners = placeLayout();
    if (owners) {
      var grid = el('g', {}, vp);
      owners.forEach(function (n) { FT.drawNode(grid, n); });
      markPlace();
      apply();
      return;
    }
    view.layout(tree);
    var edges = el('g', {}, vp);
    var nodes = el('g', {}, vp);
    stage.setAttribute('data-view', view.id);
    view.drawEdges(edges, tree);
    (function walk(n, depth) {
      FT.drawNode(nodes, n);
      FT.kidsAt(n, depth).forEach(function (c) { walk(c, depth + 1); });
    })(tree, 0);
    if (FT.state.picks.length) {
      clearHl();
      FT.state.picks.forEach(hlPath);
    } else if (FT.state.highlighted) highlight(FT.state.highlighted);
    markPlace();
    apply();
  };

  function clearHl(){
    var hl=vp.querySelectorAll('.hl');
    for(var i=0;i<hl.length;i++) hl[i].classList.remove('hl');
  }
  function highlight(id){
    clearHl();
    hlPath(id);
  }
  function hlPath(id){
    var cur=id;
    while(cur){
      var node=vp.querySelector('[data-id="'+CSS.escape(cur)+'"]');
      if(node) node.classList.add('hl');
      var edge=vp.querySelector('.edge[data-edge="'+CSS.escape(cur)+'"]');
      if(edge) edge.classList.add('hl');
      cur=FT.parentOf[cur]?FT.parentOf[cur].id:null;
    }
  }

  var tx=40, ty=20, scale=1, dragging=false, lx=0, ly=0;
  function apply(){
    vp.setAttribute('transform','translate('+tx+','+ty+') scale('+scale+')');
  }
  stage.addEventListener('mousedown',function(e){ dragging=true; lx=e.clientX; ly=e.clientY; stage.classList.add('grabbing'); });
  window.addEventListener('mousemove',function(e){ if(!dragging) return; tx+=e.clientX-lx; ty+=e.clientY-ly; lx=e.clientX; ly=e.clientY; apply(); });
  window.addEventListener('mouseup',function(){ dragging=false; stage.classList.remove('grabbing'); });
  stage.addEventListener('wheel',function(e){
    e.preventDefault();
    var f=e.deltaY<0?1.1:1/1.1;
    var r=stage.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;
    tx=mx-(mx-tx)*f; ty=my-(my-ty)*f; scale*=f; apply();
  }, {passive:false});

  // touch: one finger pans, two fingers pinch-zoom
  function tdist(t){ var dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.sqrt(dx*dx+dy*dy); }
  var touch=null;
  stage.addEventListener('touchstart',function(e){
    if(e.touches.length===1){ touch={mode:'pan', x:e.touches[0].clientX, y:e.touches[0].clientY}; }
    else if(e.touches.length===2){ touch={mode:'pinch', d:tdist(e.touches),
      cx:(e.touches[0].clientX+e.touches[1].clientX)/2, cy:(e.touches[0].clientY+e.touches[1].clientY)/2}; }
  }, {passive:false});
  stage.addEventListener('touchmove',function(e){
    if(!touch) return;
    e.preventDefault();
    if(touch.mode==='pan' && e.touches.length===1){
      tx+=e.touches[0].clientX-touch.x; ty+=e.touches[0].clientY-touch.y;
      touch.x=e.touches[0].clientX; touch.y=e.touches[0].clientY; apply();
    } else if(touch.mode==='pinch' && e.touches.length===2){
      var nd=tdist(e.touches); if(!touch.d){ touch.d=nd; return; }
      var f=nd/touch.d, r=stage.getBoundingClientRect();
      var mx=touch.cx-r.left, my=touch.cy-r.top;
      tx=mx-(mx-tx)*f; ty=my-(my-ty)*f; scale*=f; touch.d=nd; apply();
    }
  }, {passive:false});
  stage.addEventListener('touchend',function(e){ if(e.touches.length===0) touch=null; });

  var VIEW_ORDER = ['classic', 'horizontal', 'poster'];

  FT.placeholderName = function (owner, gender) {
    var en = (owner.name || owner.name_hi || owner.id) +
      (gender === 'male' ? "'s husband" : "'s wife");
    var hi = owner.name_hi ?
      owner.name_hi + (gender === 'male' ? ' के पति' : ' की पत्नी') : '';
    return FT.state.lang === 'hi' ? [hi || en] : [en];
  };

  FT.collapseBelowOpenDepth = function () {
    (function walk(n, depth) {
      if (depth >= FT.OPEN_DEPTH && (n.children || []).length) {
        FT.state.collapsed[n.id] = true;
      }
      (n.children || []).forEach(function (c) { walk(c, depth + 1); });
    })(tree, 0);
  };

  FT.expandAll = function () {
    FT.clearPicks();
    FT.state.collapsed = {};
    FT.state.depthCap = Infinity;
    FT.render();
    FT.fit();
  };

  FT.setView = function (id) {
    if (!FT.views[id]) return;
    FT.state.viewId = id;
    FT.clearPicks();
    FT.state.depthCap = null;
    try { localStorage.setItem('ft-view', id); } catch (e) {}
    document.getElementById('view-picker').value = id;
    FT.render();
    FT.fit();
  };

  FT.fit = function () {
    var view = FT.views[FT.state.viewId];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var owners = placeLayout();
    if (owners) {
      owners.forEach(function (n) {
        minX = Math.min(minX, n.x - 20); maxX = Math.max(maxX, n.x + FT.nodeW(n) + 20);
        minY = Math.min(minY, n.y - 20); maxY = Math.max(maxY, n.y + FT.nodeH(n) + 50);
      });
      view = {};
    } else (function walk(n, depth) {
      var w = FT.nodeW(n);
      var h = FT.nodeH(n);
      minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w);
      minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h);
      FT.kidsAt(n, depth).forEach(function (c) { walk(c, depth + 1); });
    })(tree, 0);
    if (view.extentPad) {
      minX = Math.min(minX, view.extentPad.minX); maxX = Math.max(maxX, view.extentPad.maxX);
      minY = Math.min(minY, view.extentPad.minY); maxY = Math.max(maxY, view.extentPad.maxY);
    }
    var r = stage.getBoundingClientRect();
    var stageW = r.width > 0 ? r.width : window.innerWidth;
    var stageH = r.height > 0 ? r.height : window.innerHeight;
    var pad = window.innerWidth < 768 ? 14 : 40;
    scale = Math.min(
      (stageW - pad * 2) / Math.max(1, maxX - minX),
      (stageH - pad * 2) / Math.max(1, maxY - minY)
    );
    scale = Math.min(scale, 1.2);
    tx = pad - minX * scale + (stageW - pad * 2 - (maxX - minX) * scale) / 2;
    ty = pad - minY * scale + (stageH - pad * 2 - (maxY - minY) * scale) / 2;
    apply();
  };

  function populateViewPicker() {
    var sel = document.getElementById('view-picker');
    VIEW_ORDER.forEach(function (id) {
      if (!FT.views[id]) return;
      var o = document.createElement('option');
      o.value = id;
      o.textContent = FT.views[id].label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { FT.setView(sel.value); });
  }

  document.getElementById('more').addEventListener('click', function () {
    document.getElementById('toolbar').classList.toggle('show-extras');
  });

  var RANK_PREFIX = 0, RANK_SUBSTRING = 1, RANK_SUBSEQUENCE = 2;

  function subsequence(hay, needle) {
    var i = 0;
    for (var j = 0; j < hay.length && i < needle.length; j++) {
      if (hay[j] === needle[i]) i++;
    }
    return i === needle.length;
  }

  var PLACE_HINT = { origin: 'Origin village', area: 'Present area', city: 'Present city · all areas' };

  FT.placeGroups = function () {
    var groups = {};
    function add(kind, name, suffix, person, owner) {
      if (!norm(name)) return;
      var key = kind + ':' + norm(name);
      var grp = groups[key] || (groups[key] = { key: key, kind: kind, name: name, suffix: '', members: [] });
      if (!grp.suffix && suffix) grp.suffix = suffix;
      grp.members.push({ person: person, owner: owner });
    }
    function addPerson(p, owner) {
      var o = p.origin || {}, a = p.address || {};
      add('origin', o.village, o.state, p, owner);
      add('area', a.locality, a.city || a.state, p, owner);
      add('city', a.city, a.state, p, owner);
    }
    FT.nodes.forEach(function (n) {
      addPerson(n, n);
      (n.spouses || []).forEach(function (s) { addPerson(s, n); });
    });
    return groups;
  };

  FT.placeMatches = function (q) {
    var needle = norm(q);
    if (!needle) return [];
    var groups = FT.placeGroups();
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return norm(g.name).indexOf(needle) >= 0; })
      .sort(function (a, b) {
        return (norm(b.name).indexOf(needle) === 0) - (norm(a.name).indexOf(needle) === 0) ||
          a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind);
      });
  };

  FT.placeLabel = function (g) {
    return g.name + (g.suffix && norm(g.suffix) !== norm(g.name) ? ', ' + g.suffix : '');
  };

  FT.showPlace = function (key) {
    var grp = FT.placeGroups()[key];
    FT.state.picks = [];
    FT.state.place = grp ? key : null;
    FT.renderPicks();
    FT.state.only = null;
    FT.closeSheet();
    FT.render();
    FT.fit();
  };

  function placeLayout() {
    var grp = FT.state.place && FT.placeGroups()[FT.state.place];
    if (!grp) return null;
    var seen = {}, owners = [];
    grp.members.forEach(function (m) {
      if (!seen[m.owner.id]) { seen[m.owner.id] = true; owners.push(m.owner); }
    });
    owners.sort(function (a, b) {
      return FT.depthOf(a.id) - FT.depthOf(b.id) ||
        FT.label(a)[0].localeCompare(FT.label(b)[0]);
    });
    var rowH = 0, area = 0;
    owners.forEach(function (n) { rowH = Math.max(rowH, FT.nodeH(n) + 70); });
    owners.forEach(function (n) { area += (FT.nodeW(n) + FT.H_GAP) * rowH; });
    var r = stage.getBoundingClientRect();
    var aspect = r.width > 0 && r.height > 0 ? r.width / r.height : 1.5;
    var rowMax = Math.max(2 * FT.CARD_W + FT.COUPLE_GAP, Math.sqrt(area * aspect));
    var x = 0, y = 0;
    owners.forEach(function (n) {
      if (x > 0 && x + FT.nodeW(n) > rowMax) { x = 0; y += rowH; }
      n.x = x;
      n.y = y;
      x += FT.nodeW(n) + FT.H_GAP;
    });
    return owners;
  }

  function markPlace() {
    var grp = FT.state.place && FT.placeGroups()[FT.state.place];
    if (!grp) return;
    grp.members.forEach(function (m) {
      var card = vp.querySelector('[data-id="' + CSS.escape(m.owner.id) + '"]');
      if (!card) return;
      var face = m.person === m.owner ? card.firstChild : card.querySelector('.spouse-card');
      if (face) face.classList.add('place-hit');
    });
  }

  FT.searchMatches = function (q, limit) {
    var needle = q.trim().toLowerCase();
    if (!needle) return { list: [], total: 0 };
    var hits = [];
    FT.nodes.forEach(function (n) {
      var fields = [n.name || '', n.name_hi || ''];
      var best = null;
      fields.forEach(function (f) {
        var hay = f.toLowerCase();
        if (!hay) return;
        var rank = null;
        if (hay.indexOf(needle) === 0) rank = RANK_PREFIX;
        else if (hay.indexOf(needle) > 0) rank = RANK_SUBSTRING;
        else if (subsequence(hay, needle)) rank = RANK_SUBSEQUENCE;
        if (rank !== null && (best === null || rank < best)) best = rank;
      });
      if (best !== null) hits.push({ node: n, rank: best });
    });
    hits.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return FT.label(a.node)[0].localeCompare(FT.label(b.node)[0]);
    });
    return { list: hits.slice(0, limit || 12), total: hits.length };
  };

  var searchBox = document.getElementById('search');
  var suggest = document.getElementById('suggest');
  var picked = -1;

  function hideSuggest() {
    suggest.classList.add('hidden');
    suggest.innerHTML = '';
    picked = -1;
  }

  function placeSuggest() {
    var r = searchBox.getBoundingClientRect();
    suggest.style.left = r.left + 'px';
    suggest.style.top = (r.bottom + 4) + 'px';
    suggest.style.width = Math.max(220, r.width) + 'px';
  }

  function renderSuggest() {
    var res = FT.searchMatches(searchBox.value);
    var places = FT.placeMatches(searchBox.value);
    if (!res.list.length && !places.length) { hideSuggest(); return; }
    var html = places.map(function (g) {
      var n = g.members.length;
      return '<button class="sg-row sg-place ' + g.kind + '" data-place="' + esc(g.key) + '">' +
        '<span class="sg-name">' + esc(FT.placeLabel(g)) + '</span>' +
        '<span class="sg-hint">' + PLACE_HINT[g.kind] + ' · ' + n + (n === 1 ? ' person' : ' people') +
        '</span></button>';
    }).join('') + res.list.map(function (m, i) {
      var parent = FT.parentOf[m.node.id];
      var hint = parent ? 'child of ' + esc(FT.label(parent)[0]) : 'root ancestor';
      return '<button class="sg-row" data-goto="' + esc(m.node.id) + '" data-i="' + i + '">' +
        '<span class="sg-name">' + esc(FT.label(m.node)[0]) + '</span>' +
        '<span class="sg-hint">' + hint + '</span></button>';
    }).join('');
    if (res.total > res.list.length) {
      html += '<p class="sg-more">' + (res.total - res.list.length) + ' more…</p>';
    }
    suggest.innerHTML = html;
    placeSuggest();
    suggest.classList.remove('hidden');
    picked = -1;
  }

  function mark() {
    var rows = suggest.querySelectorAll('.sg-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('on', i === picked);
    }
    if (picked >= 0 && rows[picked]) rows[picked].scrollIntoView({ block: 'nearest' });
  }

  var picksBar = document.getElementById('picks');
  var pickNote = '';

  FT.renderPicks = function () {
    var ids = FT.state.picks;
    var grp = FT.state.place && FT.placeGroups()[FT.state.place];
    if (grp) {
      picksBar.innerHTML = '<span class="pick pick-place">' + esc(FT.placeLabel(grp)) +
        ' · ' + grp.members.length + (grp.members.length === 1 ? ' person' : ' people') +
        '<button class="pick-clear-x" aria-label="Remove">×</button></span>';
      return;
    }
    var html = ids.map(function (id) {
      return '<span class="pick">' + esc(FT.label(FT.byId[id])[0]) +
        '<button data-drop="' + esc(id) + '" aria-label="Remove">×</button></span>';
    }).join('');
    if (ids.length > 1) {
      var a = FT.commonAncestor(ids);
      html += '<span class="pick-note">Common father: <b>' +
        (a ? esc(FT.label(FT.byId[a])[0]) : '—') + '</b></span>';
    }
    if (pickNote) html += '<span class="pick-note">' + esc(pickNote) + '</span>';
    if (ids.length) html += '<button class="pick-clear">Clear</button>';
    picksBar.innerHTML = html;
  };

  picksBar.addEventListener('click', function (e) {
    var drop = e.target.closest('[data-drop]');
    if (drop) {
      var id = drop.getAttribute('data-drop');
      FT.state.picks = FT.state.picks.filter(function (p) { return p !== id; });
      pickNote = '';
      FT.showPicks();
      return;
    }
    if (e.target.closest('.pick-clear-x')) {
      FT.showPlace(null);
      return;
    }
    if (e.target.closest('.pick-clear')) {
      pickNote = '';
      FT.state.picks = [];
      FT.showPicks();
    }
  });

  function choose(row) {
    var v = row.getAttribute('data-place');
    if (!v) { go(row.getAttribute('data-goto')); return; }
    hideSuggest();
    searchBox.value = '';
    searchBox.blur();
    pickNote = '';
    FT.showPlace(v);
  }

  function go(id) {
    hideSuggest();
    searchBox.value = '';
    searchBox.blur();
    if (FT.state.picks.indexOf(id) < 0) {
      if (FT.state.picks.length >= FT.MAX_PICKS) {
        pickNote = 'Up to ' + FT.MAX_PICKS + ' people — remove one first.';
        FT.renderPicks();
        return;
      }
      FT.state.picks = FT.state.picks.concat([id]);
    }
    pickNote = '';
    FT.showPicks();
  }

  searchBox.addEventListener('input', renderSuggest);
  searchBox.addEventListener('focus', function () {
    if (searchBox.value.trim()) renderSuggest();
  });

  searchBox.addEventListener('keydown', function (e) {
    var rows = suggest.querySelectorAll('.sg-row');
    if (e.key === 'ArrowDown' && rows.length) {
      e.preventDefault(); picked = (picked + 1) % rows.length; mark(); return;
    }
    if (e.key === 'ArrowUp' && rows.length) {
      e.preventDefault(); picked = (picked <= 0 ? rows.length : picked) - 1; mark(); return;
    }
    if (e.key === 'Escape') { hideSuggest(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (picked >= 0 && rows[picked]) { choose(rows[picked]); return; }
      if (rows.length) choose(rows[0]);
    }
  });

  suggest.addEventListener('click', function (e) {
    var row = e.target.closest('.sg-row');
    if (row) choose(row);
  });

  document.addEventListener('click', function (e) {
    if (e.target !== searchBox && !suggest.contains(e.target)) hideSuggest();
  });

  window.addEventListener('resize', function () {
    if (!suggest.classList.contains('hidden')) placeSuggest();
  });

  var LANG_OTHER = { en: 'hi', hi: 'en' };
  var LANG_LABEL = { en: 'EN', hi: 'हिं' };
  var langBtn = document.getElementById('lang');

  function markLang() {
    var next = LANG_OTHER[FT.state.lang];
    langBtn.textContent = LANG_LABEL[next];
    langBtn.title = 'Show names in ' + (next === 'hi' ? 'Hindi' : 'English');
  }

  FT.cycleLang = function () {
    FT.state.lang = LANG_OTHER[FT.state.lang];
    try { localStorage.setItem('ft-lang', FT.state.lang); } catch (e) {}
    markLang();
    FT.render();
  };

  langBtn.addEventListener('click', FT.cycleLang);
  markLang();

  document.getElementById('reset').addEventListener('click', FT.fit);
  document.getElementById('expand-all').addEventListener('click', FT.expandAll);

  document.getElementById('summary').textContent=
    'People '+summary.total+' · Male '+summary.male+' · Female '+summary.female+
    ' · Generations '+summary.generations+
    ' · Uncertain '+summary.uncertain+' · Needs-parent '+summary.needs_parent;

  var up=document.getElementById('unlinked');
  if(unlinked.length){
    var html='<h4>Unlinked — to place</h4>';
    unlinked.forEach(function(p){
      html+='<div>• '+esc(p.name||p.name_hi||p.id)+(p.note?' <em>('+esc(p.note)+')</em>':'')+'</div>';
    });
    up.innerHTML=html;
  } else {
    up.className='empty';
  }

  FT.init = function () {
    populateViewPicker();
    FT.collapseBelowOpenDepth();
    var savedLang = null;
    try { savedLang = localStorage.getItem('ft-lang'); } catch (e) {}
    if (LANG_OTHER[savedLang]) FT.state.lang = savedLang;
    markLang();
    var saved = null;
    try { saved = localStorage.getItem('ft-view'); } catch (e) {}
    var preferred = saved && FT.views[saved]
      ? saved
      : (window.innerWidth < 768 ? 'horizontal' : 'classic');
    FT.setView(preferred);
  };
})();
