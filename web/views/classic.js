FT.views.classic = {
  id: 'classic',
  label: 'Classic (top-down)',
  nodeShape: 'box',
  layout: function (root) {
    var slot = FT.SELF_W + FT.BAR + FT.SPOUSE_W + FT.H_GAP;
    var cursor = 0;
    (function place(n, depth) {
      n.depth = depth;
      n.y = depth * (FT.NODE_H + FT.V_GAP);
      var kids = FT.visibleChildren(n);
      if (!kids.length) {
        n.x = cursor + slot / 2 - FT.jointX(n);
        cursor += slot;
        return;
      }
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      var span = (first.x + FT.jointX(first) + last.x + FT.jointX(last)) / 2;
      n.x = span - FT.jointX(n);
    })(root, 0);
  },
  drawEdges: function (g, root) {
    (function walk(n) {
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var jx = n.x + FT.jointX(n), jy = n.y + FT.jointY(n);
      var busY = jy + FT.V_GAP / 2;
      FT.edge(g, 'M' + jx + ',' + jy + ' V' + busY);
      var xs = kids.map(function (c) { return c.x + FT.jointX(c); });
      FT.edge(g, 'M' + Math.min.apply(null, xs) + ',' + busY +
                 ' H' + Math.max.apply(null, xs));
      kids.forEach(function (c) {
        FT.edge(g, 'M' + (c.x + FT.jointX(c)) + ',' + busY +
                   ' V' + c.y, c.id);
        walk(c);
      });
    })(root);
  }
};
