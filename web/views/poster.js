FT.views.poster = {
  id: 'poster',
  label: 'Tree (organic)',
  nodeShape: 'box',
  cardStyle: 'parents',
  maxDepth: 4,
  extentPad: { minX: -300, maxX: 300, minY: -60, maxY: 320 },
  rowTop: function (depth) {
    if (this.plain) return -depth * 360;
    return depth === 0 ? 210 : -470 - (depth - 1) * 360;
  },
  layout: function (root) {
    var view = this;
    var cursor = 0;
    this.plain = root !== FT.nodes[0];
    function shiftRight(n, depth, dx) {
      n.x += dx;
      FT.kidsAt(n, depth).forEach(function (c) { shiftRight(c, depth + 1, dx); });
    }
    (function place(n, depth) {
      n.depth = depth;
      n.y = view.rowTop(depth);
      var kids = FT.kidsAt(n, depth);
      var start = cursor;
      if (!kids.length) {
        n.x = cursor;
        cursor += FT.nodeW(n) + FT.H_GAP;
        return;
      }
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      n.x = (first.x + FT.jointX(first) + last.x + FT.jointX(last)) / 2 - FT.jointX(n);
      if (n.x < start) {
        kids.forEach(function (c) { shiftRight(c, depth + 1, start - n.x); });
        n.x = start;
      }
      cursor = Math.max(cursor, n.x + FT.nodeW(n) + FT.H_GAP);
    })(root, 0);
    this.cx = root.x + FT.jointX(root);
    this.extentPad = {
      minX: -140,
      maxX: cursor + 140,
      minY: -80,
      maxY: this.plain ? FT.nodeH(root) + 200 : 360
    };
  },
  drawEdges: function (g, root) {
    var cx = this.cx;
    var GROUND = 70;
    var TRUNK_TOP = GROUND - FT.ROOT_ART_LEN;
    var view = this;

    var trunk = !this.plain;
    if (trunk) FT.rootArt(g, 'translate(' + cx + ',' + GROUND + ')');

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
        var fromTrunk = trunk && depth === 0;
        var x1 = fromTrunk ? cx : n.x + FT.jointX(n);
        var y1 = fromTrunk ? TRUNK_TOP + 10 : n.y;
        var thickness = fromTrunk ? 2.4 : 1.7;
        branch(x1, y1, c.x + FT.jointX(c), c.y + FT.nodeH(c),
          Math.max(fromTrunk ? 6 : 3.5, Math.sqrt(FT.leafCount(c)) * thickness), c.id);
        walk(c, depth + 1);
      });
    })(root, 0);
  },
  leaves: function (g, x1, y1, mx, my, x2, y2, id) {
    FT.leaves(g, id, FT.quadAt(x1, y1, mx, my, x2, y2), 7, 1);
  }
};
