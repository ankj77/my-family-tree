FT.views.organic = {
  id: 'organic',
  label: 'Tree (organic)',
  nodeShape: 'leaf',
  layout: function (root) {
    var SPREAD = (window.innerWidth < 768 ? 84 : 150) * Math.PI / 180;
    var TRUNK = 120;
    var RING = 115;
    (function place(n, a0, a1, depth) {
      n.depth = depth;
      var mid = (a0 + a1) / 2;
      var wobble = (FT.hash01(n.id) - 0.5) * (a1 - a0) * 0.25;
      var ang = mid + wobble;
      var r = TRUNK + depth * RING;
      n.ang = ang;
      n.x = r * Math.sin(ang);
      n.y = -r * Math.cos(ang);
      var kids = FT.visibleChildren(n);
      if (!kids.length) return;
      var total = kids.reduce(function (s, c) { return s + FT.leafCount(c); }, 0);
      var cur = a0;
      kids.forEach(function (c) {
        var share = (a1 - a0) * (FT.leafCount(c) / total);
        place(c, cur, cur + share, depth + 1);
        cur += share;
      });
    })(root, -SPREAD / 2, SPREAD / 2, 0);
  },
  drawEdges: function (g, root) {
    FT.edge(g, 'M0,40 L' + root.x + ',' + root.y).setAttribute(
      'class', 'branch trunk'
    );
    (function walk(n) {
      FT.visibleChildren(n).forEach(function (c) {
        var cx = n.x + (c.x - n.x) * 0.35 + Math.sin(n.ang) * 20;
        var cy = n.y + (c.y - n.y) * 0.35 - Math.cos(n.ang) * 20;
        var p = FT.edge(g,
          'M' + n.x + ',' + n.y + ' Q' + cx + ',' + cy + ' ' + c.x + ',' + c.y, c.id);
        p.setAttribute('class', 'edge branch');
        p.style.strokeWidth = Math.max(1.5, Math.sqrt(FT.leafCount(c)) * 1.8) + 'px';
        walk(c);
      });
    })(root);
  }
};
