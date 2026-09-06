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

  FT.edge = function (g, d, childId) {
    var attrs = { 'class': 'edge', d: d };
    if (childId) attrs['data-edge'] = childId;
    return el('path', attrs, g);
  };

  FT.SELF_W = 150; FT.SPOUSE_W = 120; FT.NODE_H = 46;
  FT.BAR = 22; FT.H_GAP = 40; FT.V_GAP = 100;

  FT.state = { lang: 'both', viewId: 'classic', collapsed: {}, selected: null };
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
  FT.stacked = function (n) {
    var view = FT.views[FT.state.viewId];
    return !!(view && view.stack);
  };
  FT.leafShaped = function () {
    var view = FT.views[FT.state.viewId];
    return !!(view && view.nodeShape === 'leaf');
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
  FT.nodeW = function (n) {
    if (FT.stacked(n)) return FT.SELF_W;
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR + FT.SPOUSE_W : FT.SELF_W;
  };
  FT.nodeH = function (n) {
    var rows = Math.max(1, FT.partners(n).length);
    if (FT.stacked(n)) return FT.NODE_H * (1 + (FT.hasPartner(n) ? rows : 0)) + 4;
    return FT.NODE_H + (rows - 1) * (FT.NODE_H + 6);
  };
  FT.jointX = function (n) {
    if (FT.leafShaped()) return 0;
    if (FT.stacked(n)) return FT.SELF_W;
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR / 2 : FT.SELF_W / 2;
  };
  FT.jointY = function (n) {
    if (FT.leafShaped()) return 0;
    return FT.stacked(n) ? FT.nodeH(n) / 2 : FT.nodeH(n);
  };

  FT.visibleChildren = function (n) {
    return FT.state.collapsed[n.id] ? [] : (n.children || []);
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
  };

  FT.select = function (id, owner) {
    var node = owner || FT.byId[id];
    if (!node) return;
    var person = node.id === id ? node :
      (node.spouses || []).filter(function (s) { return s.id === id; })[0] || node;
    FT.state.selected = id;
    highlight(node.id);
    sheetBody.innerHTML = sheetHtml(person, node);
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

  function textLines(g, lines, cx, y) {
    lines.forEach(function (t, i) {
      var te = el('text', { x: cx, y: y + i * 14, 'text-anchor': 'middle' }, g);
      if (i > 0) te.setAttribute('class', 'hi');
      te.textContent = t;
    });
  }

  function drawBox(parent, p, x, y, w, role, owner) {
    var unfilled = role === 'spouse' && !!p.placeholder;
    var cls = role + (p.status === 'uncertain' ? ' uncertain' : '') +
      (unfilled ? ' placeholder' : '');
    var g = el('g', { 'class': cls, transform: 'translate(' + x + ',' + y + ')' }, parent);
    el('rect', { width: w, height: FT.NODE_H, rx: 6 }, g);
    var textX = w / 2, thumb = 0;
    if (p.photo) {
      thumb = 16;
      var img = el('image', {
        href: p.photo, x: 6, y: FT.NODE_H / 2 - thumb, width: thumb * 2, height: thumb * 2,
        preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'inset(0 round 50%)', 'class': 'thumb'
      }, g);
      img.addEventListener('error', function () {
        g.removeChild(img);
        [].forEach.call(g.querySelectorAll('text:not(.badge)'), function (t) {
          t.setAttribute('x', w / 2);
        });
      });
      textX = (w + thumb * 2 + 6) / 2;
    }
    textLines(g, unfilled ? ['Unknown'] : FT.label(p), textX, 18);
    if (p.status === 'uncertain') {
      var b = el('text', { x: w - 12, y: 15, 'class': 'badge' }, g);
      b.textContent = '?';
    }
    if (!unfilled) {
      g.addEventListener('click', function (ev) { ev.stopPropagation(); FT.select(p.id, owner); });
    }
    return g;
  }

  FT.drawLeaf = function (parent, n) {
    var g = el('g', {
      'class': 'leafnode' + (FT.hasPartner(n) ? ' paired' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    var r = 7 + Math.min(6, Math.sqrt(FT.leafCount(n)));
    el('ellipse', { rx: r, ry: r * 0.72, 'class': 'leaf' }, g);
    if (FT.hasPartner(n)) {
      el('ellipse', { cx: r * 1.5, rx: r * 0.8, ry: r * 0.6, 'class': 'leaf spouseleaf' }, g);
    }
    var t = el('text', { y: -r - 5, 'text-anchor': 'middle', 'class': 'leaflabel' }, g);
    t.textContent = FT.label(n)[0];
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.drawNode = function (parent, n) {
    if (FT.leafShaped()) return FT.drawLeaf(parent, n);
    var g = el('g', {
      'class': 'node' + (n.status === 'uncertain' ? ' uncertain' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    drawBox(g, n, 0, 0, FT.SELF_W, 'self', n);
    FT.partners(n).forEach(function (p, i) {
      var sg;
      if (FT.stacked(n)) {
        var y = FT.NODE_H * (i + 1) + 4;
        el('line', {
          'class': 'marriage', x1: FT.SELF_W / 2, y1: FT.NODE_H,
          x2: FT.SELF_W / 2, y2: y
        }, g);
        sg = drawBox(g, p, 0, y, FT.SELF_W, 'spouse', n);
      } else {
        var yy = i * (FT.NODE_H + 6);
        el('line', {
          'class': 'marriage', x1: FT.SELF_W, y1: FT.NODE_H / 2,
          x2: FT.SELF_W + FT.BAR, y2: yy + FT.NODE_H / 2
        }, g);
        sg = drawBox(g, p, FT.SELF_W + FT.BAR, yy, FT.SPOUSE_W, 'spouse', n);
      }
      sg.setAttribute('data-spouse-of', n.id);
    });
    if ((n.children || []).length) {
      var toggleCx = FT.jointX(n) + (FT.stacked(n) ? 14 : 0);
      var toggleCy = FT.stacked(n) ? FT.jointY(n) : FT.jointY(n) + 10;
      var hit = el('circle', { 'class': 'toggle-hit', cx: toggleCx, cy: toggleCy, r: 22 }, g);
      el('circle', { 'class': 'toggle', cx: toggleCx, cy: toggleCy, r: 11 }, g);
      hit.addEventListener('click', function (ev) {
        ev.stopPropagation();
        FT.state.collapsed[n.id] = !FT.state.collapsed[n.id];
        FT.render();
      });
    }
    g.addEventListener('click', function () { FT.select(n.id, n); });
    return g;
  };

  FT.render = function () {
    while (vp.firstChild) vp.removeChild(vp.firstChild);
    var view = FT.views[FT.state.viewId] || FT.views.classic;
    view.layout(tree);
    var edges = el('g', {}, vp);
    var nodes = el('g', {}, vp);
    view.drawEdges(edges, tree);
    (function walk(n) {
      FT.drawNode(nodes, n);
      FT.visibleChildren(n).forEach(walk);
    })(tree);
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
      var node=vp.querySelector('[data-id="'+cur+'"]');
      if(node) node.classList.add('hl');
      var edge=vp.querySelector('.edge[data-edge="'+cur+'"]');
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

  var VIEW_ORDER = ['classic', 'horizontal', 'organic'];

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
    (function walk(n) {
      var w = view.nodeShape === 'leaf' ? 30 : FT.nodeW(n);
      var h = view.nodeShape === 'leaf' ? 30 : FT.nodeH(n);
      minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w);
      minY = Math.min(minY, n.y - h / 2); maxY = Math.max(maxY, n.y + h);
      FT.visibleChildren(n).forEach(walk);
    })(tree);
    if (view.nodeShape === 'leaf') {
      minX = Math.min(minX, -10); maxX = Math.max(maxX, 10);
      minY = Math.min(minY, 30); maxY = Math.max(maxY, 50);
    }
    var r = stage.getBoundingClientRect();
    var stageW = r.width > 0 ? r.width : window.innerWidth;
    var stageH = r.height > 0 ? r.height : window.innerHeight;
    var pad = 40;
    scale = Math.min(
      (stageW - pad * 2) / Math.max(1, maxX - minX),
      (stageH - pad * 2) / Math.max(1, maxY - minY)
    );
    scale = Math.max(0.05, Math.min(scale, 1.2));
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

  document.getElementById('summary').textContent=
    'People '+summary.total+' · Generations '+summary.generations+
    ' · Uncertain '+summary.uncertain+' · Needs-parent '+summary.needs_parent;

  var up=document.getElementById('unlinked');
  if(unlinked.length){
    var html='<h4>Unlinked — to place</h4>';
    unlinked.forEach(function(p){
      html+='<div>• '+(p.name||p.name_hi||p.id)+(p.note?' <em>('+p.note+')</em>':'')+'</div>';
    });
    up.innerHTML=html;
  } else {
    up.className='empty';
  }

  FT.init = function () {
    populateViewPicker();
    var saved = null;
    try { saved = localStorage.getItem('ft-view'); } catch (e) {}
    var preferred = saved && FT.views[saved]
      ? saved
      : (window.innerWidth < 768 ? 'horizontal' : 'classic');
    FT.setView(preferred);
  };
})();
