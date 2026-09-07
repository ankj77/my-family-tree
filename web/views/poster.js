FT.views.poster = {
  id: 'poster',
  label: 'Tree (organic)',
  nodeShape: 'box',
  cardStyle: 'parents',
  maxDepth: 2,
  extentPad: { minX: -300, maxX: 300, minY: -60, maxY: 320 },
  rowTop: function (depth) {
    return depth === 0 ? 210 : -470 - (depth - 1) * 360;
  },
  layout: function (root) {
    var SLOT = FT.CARD_W + FT.H_GAP;
    var view = this;
    var cursor = 0;
    (function place(n, depth) {
      n.depth = depth;
      var kids = FT.kidsAt(n, depth);
      if (!kids.length) {
        n.x = cursor;
        cursor += SLOT;
      } else {
        kids.forEach(function (c) { place(c, depth + 1); });
        n.x = (kids[0].x + kids[kids.length - 1].x) / 2;
      }
      n.y = view.rowTop(depth);
    })(root, 0);
    this.cx = root.x + FT.CARD_W / 2;
    var span = cursor > 0 ? cursor - SLOT + FT.CARD_W : FT.CARD_W;
    this.extentPad = {
      minX: this.cx - span / 2 - 140,
      maxX: this.cx + span / 2 + 140,
      minY: -80,
      maxY: 360
    };
  },
  drawEdges: function (g, root) {
    var cx = this.cx;
    var GROUND = 70;
    var TRUNK_TOP = -280;
    var view = this;

    FT.el('ellipse', {
      'class': 'poster-ground', cx: cx, cy: GROUND + 24, rx: 430, ry: 52
    }, g);

    [-1, 1].forEach(function (dir) {
      for (var i = 1; i <= 4; i++) {
        var h = FT.hash01('root' + dir + i);
        var reach = dir * (70 + i * 62 + h * 40);
        var drop = 120 + i * 34 + h * 40;
        var r = FT.el('path', {
          'class': 'poster-root',
          d: 'M' + cx + ',' + (GROUND - 10) +
             ' C' + (cx + reach * 0.35) + ',' + (GROUND + 14) +
             ' ' + (cx + reach * 0.95) + ',' + (GROUND + drop * 0.35) +
             ' ' + (cx + reach) + ',' + (GROUND + drop)
        }, g);
        r.style.strokeWidth = Math.max(2.5, 12 - i * 2.1) + 'px';
      }
    });

    var bw = 44, tw = 13;
    FT.el('path', {
      'class': 'poster-trunk',
      d: 'M' + (cx - bw) + ',' + (GROUND + 30) +
         ' C' + (cx - bw * 0.55) + ',' + (GROUND - 90) +
         ' ' + (cx - tw * 2.6) + ',' + (TRUNK_TOP + 170) +
         ' ' + (cx - tw) + ',' + TRUNK_TOP +
         ' L' + (cx + tw) + ',' + TRUNK_TOP +
         ' C' + (cx + tw * 2.6) + ',' + (TRUNK_TOP + 170) +
         ' ' + (cx + bw * 0.55) + ',' + (GROUND - 90) +
         ' ' + (cx + bw) + ',' + (GROUND + 30) + ' Z'
    }, g);

    function branch(x1, y1, x2, y2, weight, id) {
      var bow = (x2 - x1) * 0.42 + (FT.hash01(id) - 0.5) * 70;
      var mx = x1 + bow;
      var my = y1 + (y2 - y1) * 0.62;
      var p = FT.edge(g, 'M' + x1 + ',' + y1 + ' Q' + mx + ',' + my + ' ' + x2 + ',' + y2, id);
      p.setAttribute('class', 'edge poster-branch');
      p.style.strokeWidth = weight + 'px';
      view.leaves(g, x1, y1, mx, my, x2, y2, id);
    }

    (function walk(n, depth) {
      FT.kidsAt(n, depth).forEach(function (c) {
        var x1 = depth === 0 ? cx : n.x + FT.CARD_W / 2;
        var y1 = depth === 0 ? TRUNK_TOP + 10 : n.y;
        var thickness = depth === 0 ? 2.4 : 1.7;
        branch(x1, y1, c.x + FT.CARD_W / 2, c.y + FT.nodeH(c),
          Math.max(depth === 0 ? 6 : 3.5, Math.sqrt(FT.leafCount(c)) * thickness), c.id);
        walk(c, depth + 1);
      });
    })(root, 0);
  },
  leaves: function (g, x1, y1, mx, my, x2, y2, id) {
    FT.leaves(g, id, FT.quadAt(x1, y1, mx, my, x2, y2), 7, 1);
  }
};
