(function (filters) {
  function isLiving(p) {
    return p.life === 'living' && !p.died;
  }

  filters.livingKeep = function (tree) {
    var keep = {};
    (function walk(n) {
      var reached = isLiving(n) || (n.spouses || []).some(isLiving);
      (n.children || []).forEach(function (c) {
        if (walk(c)) reached = true;
      });
      if (reached) keep[n.id] = true;
      return reached;
    })(tree);
    return keep;
  };
})(typeof FT !== 'undefined' ? (FT.filters = {}) : module.exports);
