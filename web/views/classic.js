FT.views.classic = {
  id: 'classic',
  label: 'Classic (top-down)',
  nodeShape: 'box',
  layout: function (root) {
    var slot = FT.CARD_W + FT.H_GAP;
    var rowHeight = [];
    (function measure(n, depth) {
      rowHeight[depth] = Math.max(rowHeight[depth] || 0, FT.nodeH(n));
      FT.visibleChildren(n).forEach(function (c) { measure(c, depth + 1); });
    })(root, 0);
    var rowTop = [0];
    for (var d = 0; d < rowHeight.length; d++) {
      rowTop[d + 1] = rowTop[d] + rowHeight[d] + FT.V_GAP;
    }
    var cursor = 0;
    (function place(n, depth) {
      n.depth = depth;
      n.y = rowTop[depth];
      var kids = FT.visibleChildren(n);
      if (!kids.length) {
        n.x = cursor + slot / 2 - FT.jointX(n);
        cursor += slot;
        return;
      }
      kids.forEach(function (c) { place(c, depth + 1); });
      var first = kids[0], last = kids[kids.length - 1];
      var mid = (first.x + FT.jointX(first) + last.x + FT.jointX(last)) / 2;
      n.x = mid - FT.jointX(n);
    })(root, 0);
    var cx = root.x + FT.jointX(root);
    this.extentPad = {
      minX: cx - 280, maxX: cx + 280,
      minY: root.y - FT.ROOT_SCALE * (FT.ROOT_ART_LEN + 320), maxY: root.y
    };
  },
  drawEdges: function (g, root) {
    var s = FT.ROOT_SCALE;
    FT.rootArt(g, 'translate(' + (root.x + FT.jointX(root)) + ',' +
      (root.y - s * FT.ROOT_ART_LEN) + ') scale(' + s + ',' + (-s) + ')');
    (function walk(n) {
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var x1 = n.x + FT.jointX(n), y1 = n.y + FT.jointY(n);
      kids.forEach(function (c) {
        var x2 = c.x + FT.jointX(c), y2 = c.y;
        var sway = (FT.hash01(c.id) - 0.5) * 30;
        var ay = y1 + (y2 - y1) * 0.45, by = y2 - (y2 - y1) * 0.35;
        var ax = x1 + sway, bx = x2 - sway;
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
