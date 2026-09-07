FT.views.horizontal = {
  id: 'horizontal',
  label: 'Left to right',
  nodeShape: 'box',
  togglePos: function (n) { return { x: FT.nodeW(n) + 12, y: FT.jointY(n) - 2 }; },
  layout: function (root) {
    var cursor = 0;
    var COL = FT.CARD_W + 90;
    function shiftDown(n, dy) {
      n.y += dy;
      FT.visibleChildren(n).forEach(function (c) { shiftDown(c, dy); });
    }
    (function place(n, depth) {
      n.depth = depth;
      n.x = depth * COL;
      var kids = FT.visibleChildren(n);
      if (!kids.length) {
        n.y = cursor;
        cursor += FT.nodeH(n) + 34;
        return;
      }
      var subtreeTop = cursor;
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      n.y = (first.y + FT.jointY(first) + last.y + FT.jointY(last)) / 2 - FT.jointY(n);
      var dy = 0;
      if (n.y < subtreeTop) {
        dy = subtreeTop - n.y;
        kids.forEach(function (c) { shiftDown(c, dy); });
        n.y = subtreeTop;
      }
      cursor = Math.max(cursor + dy, n.y + FT.nodeH(n) + 34);
    })(root, 0);
  },
  drawEdges: function (g, root) {
    (function walk(n) {
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var x1 = n.x + FT.nodeW(n), y1 = n.y + FT.jointY(n);
      kids.forEach(function (c) {
        var x2 = c.x, y2 = c.y + FT.jointY(c);
        var sway = (FT.hash01(c.id) - 0.5) * 30;
        var ax = x1 + (x2 - x1) * 0.45, bx = x2 - (x2 - x1) * 0.35;
        var ay = y1 + sway, by = y2 - sway;
        FT.limb(g, c.id,
          'M' + x1 + ',' + y1 + ' C' + ax + ',' + ay + ' ' + bx + ',' + by +
          ' ' + x2 + ',' + y2,
          FT.cubicAt(x1, y1, ax, ay, bx, by, x2, y2),
          FT.limbWeight(c));
        walk(c);
      });
    })(root);
  }
};
