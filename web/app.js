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

  FT.state = { lang: 'both', viewId: 'classic', collapsed: {}, selected: null, highlighted: null };
  FT.OPEN_DEPTH = 2;
  FT.nodes = []; FT.byId = {}; FT.parentOf = {};

  (function walk(n, parent) {
    FT.nodes.push(n);
    FT.byId[n.id] = n;
    if (parent) FT.parentOf[n.id] = parent;
    (n.children || []).forEach(function (c) { walk(c, n); });
  })(tree, null);

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
  FT.leafCount = function (n) {
    var kids = FT.visibleChildren(n);
    if (!kids.length) return 1;
    return kids.reduce(function (sum, c) { return sum + FT.leafCount(c); }, 0);
  };
  FT.rows = function (n) {
    var partners = FT.partners(n).length;
    return 1 + partners;
  };
  FT.nodeW = function () { return FT.CARD_W; };
  FT.POSTER_CARD_H = 104;
  FT.nodeH = function (n) {
    var view = FT.views[FT.state.viewId];
    if (view && view.cardStyle === 'parents') return FT.POSTER_CARD_H;
    return FT.rows(n) * FT.ROW_H;
  };
  FT.jointX = function () {
    var view = FT.views[FT.state.viewId];
    return view && view.nodeShape === 'leaf' ? 0 : FT.CARD_W / 2;
  };
  FT.jointY = function (n) { return FT.nodeH(n); };

  FT.visibleChildren = function (n) {
    return FT.state.collapsed[n.id] ? [] : (n.children || []);
  };

  FT.metaLine = function (p) {
    var parts = [];
    if (FT.state.lang !== 'en' && p.name_hi) parts.push(p.name_hi);
    var span = FT.lifespan(p);
    if (span) parts.push(span);
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
    var lang = FT.state.lang;
    if (lang === 'en') return [p.name || p.name_hi || p.id];
    if (lang === 'hi') return [p.name_hi || p.name || p.id];
    var out = [];
    if (p.name) out.push(p.name);
    if (p.name_hi) out.push(p.name_hi);
    return out.length ? out : [p.id];
  };

  var ADDRESS_ROWS = [
    ['line', 'Address'], ['locality', 'Locality'], ['city', 'City'],
    ['state', 'State'], ['country', 'Country']
  ];

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
    if (p.note) rows += '<dt>Note</dt><dd>' + esc(p.note) + '</dd>';
    if (rows) h += '<dl>' + rows + '</dl>';

    var rel = '';
    var parent = FT.parentOf[owner.id];
    if (parent) rel += '<div><span>Parent</span> ' + personRef(parent.id) + '</div>';
    if (owner.spouses && owner.spouses.length) {
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

  FT.focus = function (id) {
    var n = FT.byId[id];
    if (!n) return;
    var c = FT.parentOf[id];
    while (c) { FT.state.collapsed[c.id] = false; c = FT.parentOf[c.id]; }
    FT.render();
    var r = stage.getBoundingClientRect();
    tx = r.width / 2 - (n.x + FT.jointX(n)) * scale;
    ty = r.height / 2 - n.y * scale;
    apply();
    FT.select(id, n);
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

  var LEAF_RAMP = ['var(--leaf-1)', 'var(--leaf-2)', 'var(--leaf-3)'];

  FT.drawLeaf = function (parent, n) {
    var deceased = FT.isDeceased(n);
    var g = el('g', {
      'class': 'leafnode' + (FT.hasPartner(n) ? ' paired' : '') +
        (deceased ? ' deceased' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    var r = 7 + Math.min(6, Math.sqrt(FT.leafCount(n)));
    var leaf = el('ellipse', { rx: r, ry: r * 0.72, 'class': 'leaf' }, g);
    leaf.style.fill = LEAF_RAMP[(n.depth || 0) % LEAF_RAMP.length];
    if (FT.hasPartner(n)) {
      var spouse = el('ellipse', { cx: r * 1.5, rx: r * 0.8, ry: r * 0.6, 'class': 'leaf spouseleaf' }, g);
      spouse.style.fill = 'var(--leaf-spouse)';
    }
    var t = el('text', { y: -r - 9, 'text-anchor': 'middle', 'class': 'leaflabel' }, g);
    t.textContent = FT.label(n)[0];
    var w = t.getComputedTextLength() + 16;
    var chip = el('rect', {
      'class': 'leaf-chip', x: -w / 2, y: -r - 22, width: w, height: 18, rx: 9
    });
    g.insertBefore(chip, t);
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.parentsOf = function (n) {
    var p = FT.parentOf[n.id];
    if (!p) return { father: null, mother: null };
    var spouse = (p.spouses && p.spouses.length) ? p.spouses[0] : null;
    if (p.gender === 'female') return { mother: p, father: spouse };
    return { father: p, mother: spouse };
  };

  function personIcon(g, cx, cy, gender) {
    var tint = gender === 'female' ? 'var(--rail-f)' : 'var(--rail-m)';
    var bg = el('circle', { 'class': 'pc-icon-bg', cx: cx, cy: cy, r: 9 }, g);
    bg.style.fill = tint;
    var head = el('circle', { 'class': 'pc-icon-fg', cx: cx, cy: cy - 2.4, r: 2.9 }, g);
    head.style.fill = tint;
    var body = el('path', {
      'class': 'pc-icon-fg',
      d: 'M' + (cx - 4.8) + ',' + (cy + 6.4) + ' a4.8,4.4 0 0 1 9.6,0 Z'
    }, g);
    body.style.fill = tint;
  }

  FT.drawParentCard = function (parent, n) {
    var H = FT.POSTER_CARD_H;
    var g = el('g', {
      'class': 'card parent-card', 'data-id': n.id,
      transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    el('rect', { 'class': 'card-shadow', x: 0, y: 3, width: FT.CARD_W, height: H, rx: 10 }, g);
    el('rect', { 'class': 'card-bg', width: FT.CARD_W, height: H, rx: 10 }, g);
    el('rect', { 'class': 'card-hit', width: FT.CARD_W, height: H }, g);
    var title = el('text', {
      'class': 'pc-name', x: FT.CARD_W / 2, y: 26, 'text-anchor': 'middle'
    }, g);
    title.textContent = FT.label(n)[0];
    fitText(title, FT.CARD_W - 24);
    el('line', { 'class': 'pc-rule', x1: 18, y1: 38, x2: FT.CARD_W - 18, y2: 38 }, g);
    var pr = FT.parentsOf(n);
    [['Father', pr.father, 'male'], ['Mother', pr.mother, 'female']].forEach(function (row, i) {
      var y = 58 + i * 30;
      personIcon(g, 32, y, row[2]);
      var lab = el('text', { 'class': 'pc-label', x: 52, y: y - 3 }, g);
      lab.textContent = row[0];
      var val = el('text', { 'class': 'pc-value', x: 52, y: y + 11 }, g);
      val.textContent = row[1] ? FT.label(row[1])[0] : '(Unknown)';
      fitText(val, FT.CARD_W - 52 - 14);
    });
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.drawNode = function (parent, n) {
    var view = FT.views[FT.state.viewId];
    if (view && view.nodeShape === 'leaf') return FT.drawLeaf(parent, n);
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
      var cx = FT.jointX(n), cy = FT.jointY(n) + 8;
      var hit = el('circle', { 'class': 'toggle-hit', cx: cx, cy: cy, r: 22 }, g);
      el('circle', { 'class': 'toggle', cx: cx, cy: cy, r: 11 }, g);
      hit.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FT.state.collapsed[n.id] = !FT.state.collapsed[n.id];
        FT.render();
      });
    }
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.maxDepth = function () {
    var view = FT.views[FT.state.viewId];
    return view && view.maxDepth !== undefined ? view.maxDepth : Infinity;
  };

  FT.render = function () {
    while (vp.firstChild) vp.removeChild(vp.firstChild);
    var view = FT.views[FT.state.viewId] || FT.views.classic;
    view.layout(tree);
    var edges = el('g', {}, vp);
    var nodes = el('g', {}, vp);
    var cap = FT.maxDepth();
    stage.setAttribute('data-view', view.id);
    view.drawEdges(edges, tree);
    (function walk(n, depth) {
      FT.drawNode(nodes, n);
      if (depth >= cap) return;
      FT.visibleChildren(n).forEach(function (c) { walk(c, depth + 1); });
    })(tree, 0);
    if (FT.state.highlighted) highlight(FT.state.highlighted);
    apply();
  };

  function clearHl(){
    var hl=vp.querySelectorAll('.hl');
    for(var i=0;i<hl.length;i++) hl[i].classList.remove('hl');
  }
  function highlight(id){
    clearHl();
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
    stage.classList.toggle('hide-labels', scale < 1.2);
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

  var VIEW_ORDER = ['classic', 'horizontal', 'organic', 'poster'];

  FT.placeholderName = function (owner, gender) {
    var en = (owner.name || owner.name_hi || owner.id) +
      (gender === 'male' ? "'s husband" : "'s wife");
    var hi = (owner.name_hi || owner.name || owner.id) +
      (gender === 'male' ? ' के पति' : ' की पत्नी');
    if (FT.state.lang === 'hi') return [hi];
    if (FT.state.lang === 'en') return [en];
    return [en, hi];
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
    FT.state.collapsed = {};
    FT.render();
    FT.fit();
  };

  FT.setView = function (id) {
    if (!FT.views[id]) return;
    FT.state.viewId = id;
    try { localStorage.setItem('ft-view', id); } catch (e) {}
    document.getElementById('view-picker').value = id;
    FT.render();
    FT.fit();
  };

  FT.fit = function () {
    var view = FT.views[FT.state.viewId];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var cap = FT.maxDepth();
    (function walk(n, depth) {
      var w = view.nodeShape === 'leaf' ? 30 : FT.nodeW(n);
      var h = view.nodeShape === 'leaf' ? 30 : FT.nodeH(n);
      minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w);
      minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h);
      if (depth >= cap) return;
      FT.visibleChildren(n).forEach(function (c) { walk(c, depth + 1); });
    })(tree, 0);
    if (view.nodeShape === 'leaf') {
      minX = Math.min(minX, -10); maxX = Math.max(maxX, 10);
      minY = Math.min(minY, 30); maxY = Math.max(maxY, 50);
    }
    if (view.extentPad) {
      minX = Math.min(minX, view.extentPad.minX); maxX = Math.max(maxX, view.extentPad.maxX);
      minY = Math.min(minY, view.extentPad.minY); maxY = Math.max(maxY, view.extentPad.maxY);
    }
    var r = stage.getBoundingClientRect();
    var stageW = r.width > 0 ? r.width : window.innerWidth;
    var stageH = r.height > 0 ? r.height : window.innerHeight;
    var pad = 40;
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

  document.getElementById('search').addEventListener('keydown',function(e){
    if(e.key!=='Enter') return;
    var q=e.target.value.trim().toLowerCase(); if(!q) return;
    var hit=null;
    for(var i=0;i<FT.nodes.length;i++){
      var n=FT.nodes[i];
      if(((n.name||'')+(n.name_hi||'')).toLowerCase().indexOf(q)>=0){ hit=n; break; }
    }
    if(!hit) return;
    scale=1;
    FT.focus(hit.id);
  });

  var langBtns=document.querySelectorAll('#toolbar [data-lang]');
  for(var i=0;i<langBtns.length;i++){
    langBtns[i].addEventListener('click', (function(b){ return function(){ FT.state.lang=b.getAttribute('data-lang'); FT.render(); }; })(langBtns[i]));
  }
  document.getElementById('reset').addEventListener('click', FT.fit);
  document.getElementById('expand-all').addEventListener('click', FT.expandAll);

  document.getElementById('summary').textContent=
    'People '+summary.total+' · Generations '+summary.generations+
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
    var saved = null;
    try { saved = localStorage.getItem('ft-view'); } catch (e) {}
    var preferred = saved && FT.views[saved]
      ? saved
      : (window.innerWidth < 768 ? 'horizontal' : 'classic');
    FT.setView(preferred);
  };
})();
