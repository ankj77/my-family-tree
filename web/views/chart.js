FT.views.chart = {
  id: 'chart',
  label: 'Family chart',
  nodeShape: 'box',
  cardStyle: 'parents',
  coupleLabel: true,
  ROW_GAP: 110,
  togglePos: function (n) {
    return { x: FT.jointX(n), y: FT.nodeH(n) + 14 };
  },
  childWord: function (c) {
    return { male: 'son', female: 'daughter' }[c.gender] || 'child';
  },
  layout: function (root) {
    var view = this;
    var cursor = 0;
    var rowH = 0;
    FT.nodes.forEach(function (n) { if (!n.hidden) rowH = Math.max(rowH, FT.nodeH(n)); });
    function shiftRight(n, depth, dx) {
      n.x += dx;
      FT.kidsAt(n, depth).forEach(function (c) { shiftRight(c, depth + 1, dx); });
    }
    (function place(n, depth) {
      n.depth = depth;
      n.y = (depth - (root.hidden ? 1 : 0)) * (rowH + view.ROW_GAP);
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
    this.extentPad = null;
  },
  drawEdges: function (g, root) {
    var view = this;
    (function walk(n, depth) {
      FT.kidsAt(n, depth).forEach(function (c) {
        if (!n.hidden) {
          var x1 = n.x + FT.jointX(n), y1 = n.y + FT.nodeH(n);
          var x2 = c.x + FT.CARD_W / 2, y2 = c.y;
          var mid = y1 + (y2 - y1) / 2;
          FT.edge(g, 'M' + x1 + ',' + y1 + ' V' + mid + ' H' + x2 + ' V' + y2, c.id)
            .setAttribute('class', 'edge chart-edge');
          var label = FT.el('text', { 'class': 'chart-label', x: x2 + 8, y: y2 - 14 }, g);
          label.textContent = view.childWord(c);
        }
        walk(c, depth + 1);
      });
    })(root, 0);
  }
};
