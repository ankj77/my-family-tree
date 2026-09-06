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
  FT.nodeW = function (n) {
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR + FT.SPOUSE_W : FT.SELF_W;
  };
  FT.nodeH = function (n) {
    var rows = Math.max(1, FT.partners(n).length);
    return FT.NODE_H + (rows - 1) * (FT.NODE_H + 6);
  };
  FT.jointX = function (n) {
    return FT.hasPartner(n) ? FT.SELF_W + FT.BAR / 2 : FT.SELF_W / 2;
  };
  FT.jointY = function (n) { return FT.nodeH(n); };

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

  FT.select = function (id) { highlight(id); };

  function textLines(g, lines, cx, y) {
    lines.forEach(function (t, i) {
      var te = el('text', { x: cx, y: y + i * 14, 'text-anchor': 'middle' }, g);
      if (i > 0) te.setAttribute('class', 'hi');
      te.textContent = t;
    });
  }

  function drawBox(parent, p, x, y, w, role, owner) {
    var cls = role + (p.status === 'uncertain' ? ' uncertain' : '') +
      (p.placeholder ? ' placeholder' : '');
    var g = el('g', { 'class': cls, transform: 'translate(' + x + ',' + y + ')' }, parent);
    el('rect', { width: w, height: FT.NODE_H, rx: 6 }, g);
    var textX = w / 2, thumb = 0;
    if (p.photo) {
      thumb = 16;
      var img = el('image', {
        href: p.photo, x: 6, y: FT.NODE_H / 2 - thumb, width: thumb * 2, height: thumb * 2,
        preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'inset(0 round 50%)', 'class': 'thumb'
      }, g);
      img.addEventListener('error', function () { g.removeChild(img); });
      textX = (w + thumb * 2 + 6) / 2;
    }
    textLines(g, p.placeholder ? ['Unknown'] : FT.label(p), textX, 18);
    if (p.status === 'uncertain') {
      var b = el('text', { x: w - 12, y: 15, 'class': 'badge' }, g);
      b.textContent = '?';
    }
    if (!p.placeholder) {
      g.addEventListener('click', function (ev) { ev.stopPropagation(); FT.select(p.id, owner); });
    }
    return g;
  }

  FT.drawNode = function (parent, n) {
    var g = el('g', {
      'class': 'node' + (n.status === 'uncertain' ? ' uncertain' : ''),
      'data-id': n.id, transform: 'translate(' + n.x + ',' + n.y + ')'
    }, parent);
    var self = el('g', { 'class': 'self' }, g);
    el('rect', { width: FT.SELF_W, height: FT.NODE_H, rx: 6 }, self);
    var textX = FT.SELF_W / 2;
    if (n.photo) {
      var img = el('image', {
        href: n.photo, x: 6, y: FT.NODE_H / 2 - 16, width: 32, height: 32,
        preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'inset(0 round 50%)', 'class': 'thumb'
      }, self);
      img.addEventListener('error', function () { self.removeChild(img); });
      textX = (FT.SELF_W + 38) / 2;
    }
    textLines(self, FT.label(n), textX, 18);
    if (n.status === 'uncertain') {
      var b = el('text', { x: FT.SELF_W - 12, y: 15, 'class': 'badge' }, self);
      b.textContent = '?';
    }
    FT.partners(n).forEach(function (p, i) {
      var y = i * (FT.NODE_H + 6);
      el('line', {
        'class': 'marriage', x1: FT.SELF_W, y1: FT.NODE_H / 2,
        x2: FT.SELF_W + FT.BAR, y2: y + FT.NODE_H / 2
      }, g);
      var sg = drawBox(g, p, FT.SELF_W + FT.BAR, y, FT.SPOUSE_W, 'spouse', n);
      sg.setAttribute('data-spouse-of', n.id);
    });
    if ((n.children || []).length) {
      var t = el('circle', {
        'class': 'toggle', cx: FT.jointX(n), cy: FT.jointY(n) + 10, r: 11
      }, g);
      t.addEventListener('click', function (ev) {
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
    var hl=document.querySelectorAll('.node.hl,.edge.hl');
    for(var i=0;i<hl.length;i++) hl[i].classList.remove('hl');
  }
  function highlight(id){
    clearHl();
    var cur=id;
    while(cur){
      var node=document.querySelector('.node[data-id="'+cur+'"]');
      if(node) node.classList.add('hl');
      var edge=document.querySelector('.edge[data-edge="'+cur+'"]');
      if(edge) edge.classList.add('hl');
      cur=FT.parentOf[cur]?FT.parentOf[cur].id:null;
    }
  }

  var tx=40, ty=20, scale=1, dragging=false, lx=0, ly=0;
  function apply(){ vp.setAttribute('transform','translate('+tx+','+ty+') scale('+scale+')'); }
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

  function resetView(){ tx=40; ty=20; scale=1; apply(); }

  document.getElementById('search').addEventListener('keydown',function(e){
    if(e.key!=='Enter') return;
    var q=e.target.value.trim().toLowerCase(); if(!q) return;
    var hit=null;
    for(var i=0;i<FT.nodes.length;i++){
      var n=FT.nodes[i];
      if(((n.name||'')+(n.name_hi||'')).toLowerCase().indexOf(q)>=0){ hit=n; break; }
    }
    if(!hit) return;
    var c=FT.parentOf[hit.id]; while(c){ FT.state.collapsed[c.id]=false; c=FT.parentOf[c.id]; }
    FT.render();
    var r=stage.getBoundingClientRect();
    scale=1; tx=r.width/2-(hit.x+FT.jointX(hit)); ty=r.height/2-(hit.y+FT.nodeH(hit)/2); apply();
    highlight(hit.id);
  });

  var langBtns=document.querySelectorAll('#toolbar [data-lang]');
  for(var i=0;i<langBtns.length;i++){
    langBtns[i].addEventListener('click', (function(b){ return function(){ FT.state.lang=b.getAttribute('data-lang'); FT.render(); }; })(langBtns[i]));
  }
  document.getElementById('reset').addEventListener('click', resetView);

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

  FT.init = function () { FT.render(); resetView(); };
})();
