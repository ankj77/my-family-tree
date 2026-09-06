FT.views.horizontal = {
  id: 'horizontal',
  label: 'Left to right',
  nodeShape: 'box',
  stack: true,
  layout: function (root) {
    var cursor = 0;
    var COL = FT.SELF_W + 90;
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
        cursor += FT.nodeH(n) + 18;
        return;
      }
      var subtreeTop = cursor;
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      n.y = (first.y + FT.jointY(first) + last.y + FT.jointY(last)) / 2 - FT.jointY(n);
      if (n.y < subtreeTop) {
        var dy = subtreeTop - n.y;
        kids.forEach(function (c) { shiftDown(c, dy); });
        n.y = subtreeTop;
      }
      cursor = Math.max(cursor, n.y + FT.nodeH(n) + 18);
    })(root, 0);
  },
  drawEdges: function (g, root) {
    (function walk(n) {
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var jx = n.x + FT.nodeW(n), jy = n.y + FT.jointY(n);
      var busX = jx + 45;
      FT.edge(g, 'M' + jx + ',' + jy + ' H' + busX);
      var ys = kids.map(function (c) { return c.y + FT.jointY(c); });
      FT.edge(g, 'M' + busX + ',' + Math.min.apply(null, ys) +
                 ' V' + Math.max.apply(null, ys));
      kids.forEach(function (c) {
        FT.edge(g, 'M' + busX + ',' + (c.y + FT.jointY(c)) + ' H' + c.x, c.id);
        walk(c);
      });
    })(root);
  }
};
