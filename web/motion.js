(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var TAGS = {
    self: ['चयनित · Selected', '#8A5A33'],
    father: ['पिता · Father', '#4F7CAC'],
    mother: ['माता · Mother', '#C2577A'],
    son: ['पुत्र · Son', '#3F7D32'],
    daughter: ['पुत्री · Daughter', '#3F7D32'],
    husband: ['पति · Husband', '#2F6A2A'],
    wife: ['पत्नी · Wife', '#2F6A2A']
  };
  var GROW_STEP = 450;
  var TAG_H = 24;

  function byGender(gender, male, female) { return gender === 'female' ? female : male; }

  function relations(owner, personId, parent, spouse) {
    var out = [];
    var isSpouse = spouse && spouse.id === personId && owner.id !== personId;
    if (isSpouse) {
      out.push({ node: owner, spouse: true, key: 'self' });
      out.push({ node: owner, spouse: false, key: byGender(owner.gender, 'husband', 'wife') });
    } else {
      out.push({ node: owner, spouse: false, key: 'self' });
      if (spouse) out.push({ node: owner, spouse: true, key: byGender(spouse.gender, 'husband', 'wife') });
      if (parent) {
        out.push({ node: parent, spouse: false, key: byGender(parent.gender, 'father', 'mother') });
        var ps = (parent.spouses || [])[0];
        if (ps) out.push({ node: parent, spouse: true, key: byGender(ps.gender, 'father', 'mother') });
      }
    }
    (owner.children || []).forEach(function (c) {
      out.push({ node: c, spouse: false, key: byGender(c.gender, 'son', 'daughter') });
    });
    return out;
  }

  function hoverText(node, spouse, parent, lang) {
    var name = function (p) { return lang === 'hi' ? (p.name_hi || p.name || p.id) : (p.name || p.name_hi || p.id); };
    if (spouse) {
      if (lang === 'hi') return name(spouse) + ' — ' + name(node) + byGender(spouse.gender, ' के पति', ' की पत्नी');
      return name(spouse) + ' — ' + byGender(spouse.gender, 'husband', 'wife') + ' of ' + name(node);
    }
    if (!parent) return null;
    var ps = (parent.spouses || [])[0];
    var both = name(parent) + (ps ? (lang === 'hi' ? ' व ' : ' & ') + name(ps) : '');
    if (lang === 'hi') return name(node) + ' — ' + both + byGender(node.gender, ' के पुत्र', ' की पुत्री');
    return name(node) + ' — ' + byGender(node.gender, 'son', 'daughter') + ' of ' + both;
  }

  var api = { relations: relations, hoverText: hoverText };
  if (typeof module !== 'undefined') { module.exports = api; return; }

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia && matchMedia('(hover: hover)').matches;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function vp() { return document.getElementById('viewport'); }
  function stage() { return document.getElementById('stage'); }
  function cardOf(id) { return vp().querySelector('.card[data-id="' + CSS.escape(id) + '"]'); }
  function edgeOf(id) { return vp().querySelector('.edge[data-edge="' + CSS.escape(id) + '"]'); }
  function spouseX() { return FT.CARD_W + FT.COUPLE_GAP; }

  var glideFrame = null;
  function glide(target) {
    if (glideFrame) cancelAnimationFrame(glideFrame);
    if (reduce) { FT.setCamera(target); return; }
    var from = FT.camera(), start = performance.now(), ms = 750;
    (function step(now) {
      var k = Math.min(1, (now - start) / ms);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      FT.setCamera({
        tx: from.tx + (target.tx - from.tx) * e,
        ty: from.ty + (target.ty - from.ty) * e,
        scale: from.scale + (target.scale - from.scale) * e
      });
      glideFrame = k < 1 ? requestAnimationFrame(step) : null;
    })(start);
  }

  function fitBox(box) {
    var r = stage().getBoundingClientRect();
    r = { left: r.left, top: r.top, width: r.width, height: r.height };
    var sheet = document.getElementById('sheet');
    if (sheet && !sheet.classList.contains('hidden')) {
      var s = sheet.getBoundingClientRect();
      if (s.left > r.left + r.width / 2) r.width = s.left - r.left;
      else if (s.top > r.top + r.height / 2) r.height = s.top - r.top;
    }
    var pad = r.width < 768 ? 16 : 50;
    var w = Math.max(1, box.x1 - box.x0), h = Math.max(1, box.y1 - box.y0);
    var scale = Math.min((r.width - 2 * pad) / w, (r.height - 2 * pad) / h, 1);
    scale = Math.max(scale, Math.min(FT.camera().scale, 0.35));
    return {
      scale: scale,
      tx: r.width / 2 - scale * (box.x0 + box.x1) / 2,
      ty: r.height / 2 - scale * (box.y0 + box.y1) / 2
    };
  }

  function drawn(rel) {
    if (!cardOf(rel.node.id)) return false;
    return !rel.spouse || (!!FT.spouseOf(rel.node) && !FT.dotSize());
  }

  function unfocus() {
    if (!vp()) return;
    Array.prototype.forEach.call(vp().querySelectorAll('.fam'), function (e) { e.classList.remove('fam'); });
    var tags = vp().querySelector('.ft-tags');
    if (tags) tags.remove();
    stopPulse();
  }

  function focus(id, owner, animate) {
    unfocus();
    owner = owner || FT.ownerOf(id);
    if (!owner || !cardOf(owner.id)) return;
    var rels = relations(owner, id, FT.parentOf[owner.id], FT.spouseOf(owner)).filter(drawn);
    var layer = el('g', { 'class': 'ft-tags' }, vp());
    var box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    rels.forEach(function (rel) {
      var n = rel.node;
      cardOf(n.id).classList.add('fam');
      if (rel.key === 'son' || rel.key === 'daughter') {
        var e = edgeOf(n.id);
        if (e) e.classList.add('fam');
      }
      var x = n.x + (rel.spouse ? spouseX() : 0), y = n.y;
      var tag = TAGS[rel.key];
      var w = tag[0].length * 7 + 22;
      var g = el('g', { 'class': 'ft-tag', transform: 'translate(' + (x + 14) + ',' + (y - 28 - TAG_H) + ')' }, layer);
      el('rect', { width: w, height: TAG_H, rx: TAG_H / 2, fill: tag[1] }, g);
      el('text', { x: w / 2, y: 16.5, 'text-anchor': 'middle' }, g).textContent = tag[0];
      if (animate && !reduce) g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 450, fill: 'backwards' });
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x + FT.CARD_W);
      box.y0 = Math.min(box.y0, y - 30 - TAG_H); box.y1 = Math.max(box.y1, y + FT.nodeH(n));
    });
    if (!animate) return;
    glide(fitBox(box));
    runPulse(id, owner);
  }

  var pulseRun = 0;
  function stopPulse() {
    pulseRun++;
    var dot = vp() && vp().querySelector('.ft-pulse');
    if (dot) dot.remove();
  }

  function runPulse(id, owner) {
    if (reduce) return;
    var segs = [], here = null;
    if (owner.id !== id) {
      here = { x: owner.x + FT.CARD_W / 2, y: owner.y + FT.nodeH(owner) / 2 };
      segs.push({ from: { x: owner.x + spouseX() + FT.CARD_W / 2, y: here.y }, to: here });
    }
    for (var n = owner; FT.parentOf[n.id]; n = FT.parentOf[n.id]) {
      var path = edgeOf(n.id);
      if (!path) break;
      var L = path.getTotalLength();
      var end = path.getPointAtLength(L);
      if (here) segs.push({ from: here, to: { x: end.x, y: end.y } });
      segs.push({ path: path, length: L, arrive: FT.parentOf[n.id] });
      var startPt = path.getPointAtLength(0);
      here = { x: startPt.x, y: startPt.y };
    }
    if (!segs.length) return;
    var run = ++pulseRun;
    var scale = FT.camera().scale;
    var dot = el('circle', { 'class': 'ft-pulse', r: 9 / Math.max(scale, 0.2) }, vp());
    dot.style.visibility = 'hidden';
    var speed = 0.6 / Math.max(scale, 0.2);
    var i = 0, t0 = null;
    setTimeout(function () {
      if (run !== pulseRun) return;
      dot.style.visibility = '';
      requestAnimationFrame(function step(now) {
        if (run !== pulseRun) return;
        if (i >= segs.length) { setTimeout(function () { if (run === pulseRun) dot.remove(); }, 500); return; }
        var s = segs[i];
        if (t0 === null) t0 = now;
        var L = s.path ? s.length : Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y);
        var k = Math.min(1, (now - t0) * speed / Math.max(L, 1));
        var p = s.path ? s.path.getPointAtLength(L * (1 - k))
          : { x: s.from.x + (s.to.x - s.from.x) * k, y: s.from.y + (s.to.y - s.from.y) * k };
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        if (k >= 1) {
          if (s.arrive) {
            var card = cardOf(s.arrive.id);
            if (card) {
              card.classList.add('ft-lit');
              setTimeout(function () { card.classList.remove('ft-lit'); }, 900);
            }
          }
          i++;
          t0 = null;
        }
        requestAnimationFrame(step);
      });
    }, 700);
  }

  function grow() {
    if (reduce || !vp()) return;
    var top = FT.top();
    var base = FT.depthOf(top.id);
    var depth = function (id) { return FT.byId[id] ? FT.depthOf(id) - base : 0; };
    Array.prototype.forEach.call(vp().querySelectorAll('.root-art'), function (e) {
      e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'backwards' });
    });
    Array.prototype.forEach.call(vp().querySelectorAll('.card[data-id]'), function (e) {
      var d = depth(e.getAttribute('data-id'));
      e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 150 + d * GROW_STEP, fill: 'backwards' });
    });
    var current = 0;
    Array.prototype.forEach.call(vp().querySelectorAll('.edge, .poster-leaf'), function (e) {
      if (e.classList.contains('poster-leaf')) {
        e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 150 + current * GROW_STEP, fill: 'backwards' });
        return;
      }
      var child = e.getAttribute('data-edge');
      if (!child || !e.getTotalLength) return;
      current = depth(child);
      var L = e.getTotalLength();
      e.style.strokeDasharray = L;
      var a = e.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }],
        { duration: GROW_STEP, delay: 150 + (current - 1) * GROW_STEP, easing: 'ease-out', fill: 'backwards' });
      a.onfinish = a.oncancel = function () { e.style.strokeDasharray = ''; };
    });
  }

  var tip = null;
  function onHover(ev) {
    if (!tip) return;
    var spouseCard = ev.target.closest && ev.target.closest('.spouse-card');
    var card = ev.target.closest && ev.target.closest('.card[data-id]');
    Array.prototype.forEach.call(vp().querySelectorAll('.edge.ft-hover'), function (e) { e.classList.remove('ft-hover'); });
    var node = card && FT.byId[card.getAttribute('data-id')];
    var text = node && hoverText(node, spouseCard ? FT.spouseOf(node) : null, FT.parentOf[node.id], FT.state.lang);
    if (!text) { tip.hidden = true; return; }
    if (!spouseCard) {
      var e = edgeOf(node.id);
      if (e) e.classList.add('ft-hover');
    }
    var r = stage().getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = (ev.clientX - r.left) + 'px';
    tip.style.top = (ev.clientY - r.top) + 'px';
    tip.hidden = false;
  }

  function attach() {
    var select = FT.select, closeSheet = FT.closeSheet, render = FT.render;
    FT.select = function (id, owner) {
      select.apply(this, arguments);
      focus(id, owner && !owner.url ? owner : null, true);
    };
    FT.closeSheet = function () {
      closeSheet.apply(this, arguments);
      unfocus();
    };
    FT.render = function () {
      render.apply(this, arguments);
      if (FT.state.selected) focus(FT.state.selected, null, false);
    };
    var s = stage();
    if (canHover && s && !s.querySelector('.ft-tip')) {
      tip = document.createElement('div');
      tip.className = 'ft-tip';
      tip.hidden = true;
      s.appendChild(tip);
      vp().addEventListener('mousemove', onHover);
      vp().addEventListener('mouseleave', function () {
        tip.hidden = true;
        Array.prototype.forEach.call(vp().querySelectorAll('.edge.ft-hover'), function (e) { e.classList.remove('ft-hover'); });
      });
    }
  }

  api.attach = attach;
  api.grow = grow;
  FT.motion = api;
})();
