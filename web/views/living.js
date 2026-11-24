FT.views.living = {
  id: 'living',
  label: 'Living tree',
  dot: 18,
  LEAF: 'M0,0 C5,-7 15,-8 22,0 C15,8 5,7 0,0 Z',
  PALETTE: {
    male: ['#3f7d32', '#559a3f', '#6fb24c', '#2f6a2a', '#86c062', '#4a8c3a'],
    female: ['#e86a9a', '#f28fb4', '#d94f86', '#f6a9c6', '#c7477a', '#ef7fa8'],
    deceased: ['#d9822b', '#c9612b', '#e2aa3c', '#b4492a', '#e8c15a']
  },

  pos: function (a, r) {
    return { x: r * Math.sin(a), y: -r * Math.cos(a) * 1.15 };
  },

  layout: function (root) {
    var view = this;
    var placed = [];
    var slots = 0;
    (function place(n, depth) {
      n.depth = depth;
      placed.push(n);
      var kids = FT.kidsAt(n, depth);
      n.livingKids = kids;
      if (!kids.length) {
        n.slot = slots++;
        n.weight = 1;
        return;
      }
      kids.forEach(function (c) { place(c, depth + 1); });
      n.slot = (kids[0].slot + kids[kids.length - 1].slot) / 2;
      n.weight = kids.reduce(function (s, c) { return s + c.weight; }, 1);
    })(root, 0);

    var big = placed.length > 300;
    var span = Math.min(Math.PI * 0.8, Math.max(Math.PI / 4, slots * 0.3));
    var step = slots > 1 ? span / (slots - 1) : 0;
    var minGap = big ? 46 : 70, dy = big ? 150 : 175;
    var byDepth = [];
    placed.forEach(function (n) {
      n.ang = (n.slot - (slots - 1) / 2) * step;
      (byDepth[n.depth] = byDepth[n.depth] || []).push(n.ang);
    });
    var height = byDepth.length - 1;
    var need = [0];
    var outer = height * dy;
    for (var k = 1; k <= height; k++) {
      var angles = byDepth[k].sort(function (a, b) { return a - b; });
      var gap = Infinity;
      for (var i = 1; i < angles.length; i++) gap = Math.min(gap, angles[i] - angles[i - 1]);
      need[k] = gap === Infinity || gap === 0 ? 0 : minGap / gap;
      outer = Math.max(outer, need[k] * Math.pow(height / k, 0.6));
    }
    var rings = [0];
    for (k = 1; k <= height; k++) {
      rings[k] = Math.max(rings[k - 1] + dy, need[k], outer * Math.pow(k / height, 0.85));
    }

    var minX = 0, maxX = 0, minY = 0;
    placed.forEach(function (n) {
      n.ring = rings[n.depth];
      var p = view.pos(n.ang, n.ring);
      n.x = p.x;
      n.y = p.y;
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y);
    });

    var crown = Math.max(rings[rings.length - 1], 200);
    this.big = big;
    this.wood = Math.max(1, Math.pow(crown / 700, 0.6));
    this.leafScale = Math.min(2.4, Math.max(1, this.wood * 0.75));
    this.trunkH = Math.max(140, crown * 0.2);
    this.crown = crown;
    this.extentPad = { minX: minX - 220, maxX: maxX + 220, minY: minY - 200, maxY: this.trunkH + 90 };
  },

  width: function (n) {
    return Math.min(70 * this.wood, (3 + 2.6 * Math.sqrt(n.weight)) * this.wood);
  },

  branchPath: function (p0, p1, p2, p3, w0, w1) {
    var left = [], right = [];
    for (var i = 0; i <= 16; i++) {
      var t = i / 16, u = 1 - t;
      var x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      var y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      var dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
      var dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
      var len = Math.hypot(dx, dy);
      if (len < 1e-6) { dx = p3.x - p0.x; dy = p3.y - p0.y; len = Math.hypot(dx, dy) || 1; }
      var w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2;
      left.push((x - dy / len * w).toFixed(1) + ',' + (y + dx / len * w).toFixed(1));
      right.unshift((x + dy / len * w).toFixed(1) + ',' + (y - dx / len * w).toFixed(1));
    }
    return 'M' + left.join(' L') + ' L' + right.join(' L') + ' Z';
  },

  drawEdges: function (g, root) {
    var view = this;
    var el = FT.el;
    var trunkH = this.trunkH;
    var trunkW = this.width(root) * 1.35;
    var at = function (x, y) { return { x: x, y: y }; };

    el('ellipse', { 'class': 'living-ground', cx: 0, cy: trunkH + 10,
      rx: Math.max(380, this.crown * 0.75), ry: Math.max(50, this.crown * 0.06) }, g);
    var bark = el('g', { 'class': 'root-art living-bark' }, g);
    [[-1, 0.9], [-1, 0.45], [1, 0.5], [1, 0.95]].forEach(function (r) {
      var s = r[0], f = r[1];
      var ex = s * trunkW * (1.2 + f), ey = trunkH + 14 + f * 10;
      el('path', { d: view.branchPath(at(s * trunkW * 0.25, trunkH - 25), at(s * trunkW * 0.35, trunkH),
        at(ex * 0.7, ey - 4), at(ex, ey), trunkW * 0.42 * f + 6, 2) }, bark);
    });
    el('path', { d: view.branchPath(at(0, trunkH + 6), at(0, trunkH * 0.6), at(0, trunkH * 0.3), at(0, 0),
      trunkW * 1.15, this.width(root)) }, bark);

    var branches = el('g', { 'class': 'living-bark' }, g);
    (function walk(n) {
      n.livingKids.forEach(function (c) {
        var mid = n.ring + (c.ring - n.ring) * 0.5;
        var d = view.branchPath(at(n.x, n.y), view.pos(n.ang, n.depth === 0 ? (c.ring - n.ring) * 0.35 : mid),
          view.pos(c.ang, mid), at(c.x, c.y), view.width(c) * 1.05, view.width(c) * 0.7);
        FT.edge(branches, d, c.id).setAttribute('class', 'edge living-branch');
        walk(c);
      });
    })(root);
    (function knots(n) {
      el('circle', { 'class': 'living-knot', cx: n.x, cy: n.y, r: view.width(n) * 0.36 }, branches);
      n.livingKids.forEach(knots);
    })(root);

    var leaves = el('g', { 'class': 'living-leaves' + (this.big ? '' : ' sway') }, g);
    (function grow(n) {
      view.leafCluster(leaves, n);
      n.livingKids.forEach(grow);
    })(root);
  },

  leafCluster: function (parent, n) {
    if (n.hidden) return;
    var view = this;
    var inner = n.livingKids.length > 0;
    var count = inner ? (this.big ? 3 : 5) : (this.big ? 5 : 9);
    var pal = FT.isDeceased(n) ? this.PALETTE.deceased : this.PALETTE[n.gender] || this.PALETTE.male;
    var cluster = FT.el('g', { 'class': 'living-cluster', transform: 'translate(' + n.x + ',' + n.y + ')' }, parent);
    cluster.style.animationDelay = (-FT.hash01(n.id + 'sway') * 4).toFixed(2) + 's';
    for (var i = 0; i < count; i++) {
      var r = function (k) { return FT.hash01(n.id + 'leaf' + i + k); };
      var ang = n.ang + (r('a') - 0.5) * (inner ? 3.4 : 2.4);
      var p = view.pos(ang, (10 + r('d') * (inner ? 24 : 34)) * this.leafScale);
      var rot = ang * 180 / Math.PI - 90 + (r('r') - 0.5) * 70;
      var leaf = FT.el('path', { 'class': 'poster-leaf living-leaf', d: this.LEAF,
        transform: 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') rotate(' + rot.toFixed(0) + ') scale(' +
          ((0.75 + r('s') * 0.6) * this.leafScale).toFixed(2) + ')' }, cluster);
      leaf.style.fill = pal[Math.floor(r('c') * pal.length)];
    }
  },

  shortName: function (p) {
    var full = FT.label(p)[0] || '';
    return full.length > 26 ? full.slice(0, 25) + '…' : full;
  },

  drawNode: function (parent, n) {
    var el = FT.el;
    var root = n.depth === 0;
    var g = el('g', {
      'class': 'card living-node' + (FT.isDeceased(n) ? ' deceased' : '') + (root ? ' root' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    el('circle', { 'class': 'fruit', r: root ? 13 : 9 }, g);
    el('text', { 'class': 'initial', dy: '0.35em', 'text-anchor': 'middle' }, g)
      .textContent = Array.from(this.shortName(n) || '?')[0].toUpperCase();

    var sp = FT.spouseOf(n);
    var sub = [FT.lifespan(n), sp ? '& ' + this.shortName(sp) : ''].filter(Boolean).join('  ');
    var hasKids = (n.children || []).length > 0 && !FT.state.place;
    var outward = this.pos(n.ang || 0, 24);
    var label;
    if (!n.livingKids || n.livingKids.length || root) {
      label = el('text', { 'class': 'living-label', 'text-anchor': 'middle', y: root ? 34 : 26 }, g);
      el('tspan', { 'class': 'nm', x: 0 }, label).textContent = this.shortName(n);
      if (sub) el('tspan', { 'class': 'sub', x: 0, dy: '1.25em' }, label).textContent = sub;
    } else {
      var deg = n.ang * 180 / Math.PI;
      var right = n.ang >= 0;
      var gap = hasKids ? 40 : 22;
      label = el('text', { 'class': 'living-label', dy: '0.32em', x: right ? gap : -gap,
        'text-anchor': right ? 'start' : 'end', transform: 'rotate(' + (right ? deg - 90 : deg + 90) + ')' }, g);
      el('tspan', { 'class': 'nm' }, label).textContent = this.shortName(n);
      if (sub) el('tspan', { 'class': 'sub', dx: 6 }, label).textContent = sub;
    }
    el('title', {}, g).textContent = FT.label(n)[0];
    g.addEventListener('click', function () { FT.select(n.id, n); });
    if (hasKids) FT.knob(g, n, outward.x, outward.y);
    return g;
  }
};
