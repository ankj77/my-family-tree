FT.views.chart = {
  id: 'chart',
  label: 'Family chart',
  nodeShape: 'box',
  cardStyle: 'parents',
  ROW_GAP: 110,
  COL_GAP: 130,
  layout: function (root) {
    var view = this;
    var cards = FT.nodes.filter(function (n) { return !n.hidden; });
    var rowH = 0, top = -Infinity;
    cards.forEach(function (n) {
      rowH = Math.max(rowH, FT.nodeH(n));
      top = Math.max(top, n.gen);
    });
    cards.forEach(function (n) {
      n.x = n.col * (FT.CARD_W + view.COL_GAP);
      n.y = (top - n.gen) * (rowH + view.ROW_GAP);
    });
    root.x = cards.length ? cards[0].x : 0;
    root.y = cards.length ? cards[0].y : 0;
    this.extentPad = null;
  },
  caption: function (g, x, y, text, cls) {
    FT.el('text', { 'class': 'chart-label' + (cls ? ' ' + cls : ''), x: x, y: y }, g).textContent = text;
  },
  drawEdges: function (g) {
    var view = this;
    (FT.linkEdges || []).forEach(function (e) {
      var a = FT.byId[e.from], b = FT.byId[e.to];
      if (!a || !b) return;
      if (e.label === 'married') {
        var left = a.x < b.x ? a : b, right = left === a ? b : a;
        var y = left.y + FT.nodeH(left) / 2;
        var x1 = left.x + FT.CARD_W, x2 = right.x;
        FT.edge(g, 'M' + x1 + ',' + y + ' H' + x2).setAttribute('class', 'edge chart-edge chart-marriage');
        view.caption(g, (x1 + x2) / 2, y - 10, 'married', 'chart-married');
        return;
      }
      var px = a.x + FT.CARD_W / 2, py = a.y + FT.nodeH(a);
      var cx = b.x + FT.CARD_W / 2, cy = b.y;
      var mid = py + (cy - py) / 2;
      FT.edge(g, 'M' + px + ',' + py + ' V' + mid + ' H' + cx + ' V' + cy, b.id)
        .setAttribute('class', 'edge chart-edge');
      view.caption(g, cx + 8, cy - 14, e.label);
    });
  }
};
