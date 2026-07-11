import json
from typing import List

from family_tree.model import Person
from family_tree.tree import Summary


def _person_json(p: Person) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "name_hi": p.name_hi,
        "born": p.born,
        "note": p.note,
        "status": p.status,
    }


def _node_json(node: dict) -> dict:
    d = _person_json(node["person"])
    d["wives"] = [_person_json(w) for w in node["wives"]]
    d["children"] = [_node_json(c) for c in node["children"]]
    return d


def _embed(obj) -> str:
    # ensure_ascii=False keeps Devanagari readable; escape </ so it can't close the script tag
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def render_html(root: dict, unlinked: List[Person], summary: Summary) -> str:
    tree_json = _embed(_node_json(root))
    unlinked_json = _embed([_person_json(p) for p in unlinked])
    summary_json = _embed(
        {
            "total": summary.total,
            "generations": summary.generations,
            "uncertain": summary.uncertain,
            "needs_parent": summary.needs_parent,
        }
    )
    return (
        _TEMPLATE
        .replace("/*__TREE__*/", tree_json)
        .replace("/*__UNLINKED__*/", unlinked_json)
        .replace("/*__SUMMARY__*/", summary_json)
    )


_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Family Tree</title>
<style>
  html,body{margin:0;height:100%;font-family:system-ui,Arial,"Noto Sans Devanagari",sans-serif;}
  body{display:flex;flex-direction:column;}
  #toolbar{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:8px;align-items:center;
    padding:6px 12px;background:#f4f4f4;border-bottom:1px solid #ccc;z-index:10;box-sizing:border-box;}
  #toolbar input{padding:6px 8px;flex:1 1 140px;min-width:0;max-width:260px;font-size:16px;}
  #toolbar button{padding:6px 10px;cursor:pointer;font-size:14px;}
  #toolbar .summary{width:100%;font-size:12px;color:#555;}
  #stage{flex:1 1 auto;position:relative;overflow:hidden;background:#fff;cursor:grab;touch-action:none;}
  #stage.grabbing{cursor:grabbing;}
  svg{width:100%;height:100%;display:block;}
  .edge{fill:none;stroke:#bbb;stroke-width:1.5px;}
  .edge.hl{stroke:#d35400;stroke-width:2.5px;}
  .node rect{fill:#eef4fb;stroke:#6b8fb5;rx:6;cursor:pointer;}
  .node.hl rect{stroke:#d35400;stroke-width:2px;fill:#fdf0e6;}
  .node.uncertain rect{stroke-dasharray:4 3;fill:#fbf6e6;}
  .node text{font-size:12px;fill:#222;pointer-events:none;}
  .node text.hi{font-size:11px;fill:#555;}
  .wife rect{fill:#fbeef4;stroke:#b56b8f;rx:6;}
  .wife text{font-size:11px;fill:#333;pointer-events:none;}
  .marriage{stroke:#b56b8f;stroke-width:1.5px;}
  .toggle{fill:#6b8fb5;cursor:pointer;}
  .badge{font-size:12px;fill:#c0392b;font-weight:bold;pointer-events:none;}
  #unlinked{position:absolute;right:0;top:0;width:230px;max-width:70%;max-height:45%;overflow:auto;background:#fffaf0;
    border-left:1px solid #ddd;border-bottom:1px solid #ddd;padding:8px;font-size:12px;z-index:5;box-sizing:border-box;}
  #unlinked h4{margin:0 0 6px;}
  #unlinked.empty{display:none;}
</style>
</head>
<body>
<div id="toolbar">
  <input id="search" placeholder="Search name, press Enter" autocomplete="off">
  <button data-lang="both">EN+हिं</button>
  <button data-lang="en">EN</button>
  <button data-lang="hi">हिं</button>
  <button id="reset">Reset view</button>
  <span class="summary" id="summary"></span>
</div>
<div id="stage"><svg><g id="viewport"></g></svg></div>
<div id="unlinked"></div>
<script id="tree-data" type="application/json">/*__TREE__*/</script>
<script id="unlinked-data" type="application/json">/*__UNLINKED__*/</script>
<script id="summary-data" type="application/json">/*__SUMMARY__*/</script>
<script>
(function(){
  var NS="http://www.w3.org/2000/svg";
  var NODE_W=170, NODE_H=46, H_GAP=170, V_GAP=100, WIFE_W=110, WIFE_H=38;
  var tree=JSON.parse(document.getElementById('tree-data').textContent);
  var unlinked=JSON.parse(document.getElementById('unlinked-data').textContent);
  var summary=JSON.parse(document.getElementById('summary-data').textContent);
  var vp=document.getElementById('viewport');
  var stage=document.getElementById('stage');
  var lang='both';

  var parentOf={};
  (function walk(n){ (n.children||[]).forEach(function(c){ parentOf[c.id]=n; walk(c); }); })(tree);
  var all=[]; (function walk(n){ all.push(n); (n.children||[]).forEach(walk); })(tree);

  function label(p){
    if(lang==='en') return [p.name||p.name_hi||p.id];
    if(lang==='hi') return [p.name_hi||p.name||p.id];
    var out=[]; if(p.name) out.push(p.name); if(p.name_hi) out.push(p.name_hi);
    return out.length?out:[p.id];
  }

  var leaf=0;
  function layout(n, depth){
    n.depth=depth; n.y=depth*V_GAP;
    var kids=n._collapsed?[]:(n.children||[]);
    if(!kids.length){ n.x=leaf*(NODE_W+H_GAP); leaf++; }
    else {
      kids.forEach(function(c){ layout(c, depth+1); });
      n.x=(kids[0].x + kids[kids.length-1].x)/2;
    }
  }

  function el(tag, attrs, parent){
    var e=document.createElementNS(NS, tag);
    for(var k in attrs){ e.setAttribute(k, attrs[k]); }
    if(parent) parent.appendChild(e);
    return e;
  }

  function textLines(g, lines, cx, y){
    lines.forEach(function(t,i){
      var te=el('text', {x:cx, y:y+i*14, 'text-anchor':'middle'}, g);
      if(i>0) te.setAttribute('class','hi');
      te.textContent=t;
    });
  }

  function render(){
    while(vp.firstChild) vp.removeChild(vp.firstChild);
    leaf=0; layout(tree,0);
    var edges=el('g', {}, vp);
    var nodes=el('g', {}, vp);
    (function draw(n){
      var kids=n._collapsed?[]:(n.children||[]);
      kids.forEach(function(c){
        var midY=(n.y+NODE_H+c.y)/2;
        el('path', {'class':'edge','data-edge':c.id,
          d:'M'+(n.x+NODE_W/2)+','+(n.y+NODE_H)+' C'+(n.x+NODE_W/2)+','+midY+' '+(c.x+NODE_W/2)+','+midY+' '+(c.x+NODE_W/2)+','+c.y
        }, edges);
        draw(c);
      });
      var cls='node'+(n.status==='uncertain'?' uncertain':'');
      var g=el('g', {'class':cls, 'data-id':n.id, transform:'translate('+n.x+','+n.y+')'}, nodes);
      el('rect', {width:NODE_W, height:NODE_H}, g);
      textLines(g, label(n), NODE_W/2, 18);
      if(n.status==='uncertain'){ var b=el('text',{x:NODE_W-12,y:15,'class':'badge'},g); b.textContent='?'; }
      (n.wives||[]).forEach(function(w,i){
        var wx=NODE_W+30, wy=i*(WIFE_H+6);
        el('line',{'class':'marriage',x1:NODE_W,y1:NODE_H/2,x2:NODE_W+30,y2:wy+WIFE_H/2},g);
        var wcls='wife'+(w.status==='uncertain'?' uncertain':'');
        var wg=el('g',{'class':wcls, transform:'translate('+wx+','+wy+')'},g);
        el('rect',{width:WIFE_W,height:WIFE_H},wg);
        textLines(wg, label(w), WIFE_W/2, 16);
      });
      if((n.children||[]).length){
        var tg=el('circle',{'class':'toggle',cx:NODE_W/2,cy:NODE_H+2,r:6},g);
        tg.addEventListener('click',function(ev){ ev.stopPropagation(); n._collapsed=!n._collapsed; render(); });
      }
      g.addEventListener('click',function(){ highlight(n.id); });
    })(tree);
    apply();
  }

  function clearHl(){
    var hl=document.querySelectorAll('.node.hl,.edge.hl');
    for(var i=0;i<hl.length;i++) hl[i].classList.remove('hl');
  }
  function highlight(id){
    clearHl();
    var cur=id;
    while(cur){
      var node=document.querySelector('.node[data-id="'+cur+'"]');
      if(node) node.classList.add('hl');
      var edge=document.querySelector('.edge[data-edge="'+cur+'"]');
      if(edge) edge.classList.add('hl');
      cur=parentOf[cur]?parentOf[cur].id:null;
    }
  }

  var tx=40, ty=20, scale=1, dragging=false, lx=0, ly=0;
  function apply(){ vp.setAttribute('transform','translate('+tx+','+ty+') scale('+scale+')'); }
  stage.addEventListener('mousedown',function(e){ dragging=true; lx=e.clientX; ly=e.clientY; stage.classList.add('grabbing'); });
  window.addEventListener('mousemove',function(e){ if(!dragging) return; tx+=e.clientX-lx; ty+=e.clientY-ly; lx=e.clientX; ly=e.clientY; apply(); });
  window.addEventListener('mouseup',function(){ dragging=false; stage.classList.remove('grabbing'); });
  stage.addEventListener('wheel',function(e){
    e.preventDefault();
    var f=e.deltaY<0?1.1:1/1.1;
    var r=stage.getBoundingClientRect();
    var mx=e.clientX-r.left, my=e.clientY-r.top;
    tx=mx-(mx-tx)*f; ty=my-(my-ty)*f; scale*=f; apply();
  }, {passive:false});

  // touch: one finger pans, two fingers pinch-zoom
  function tdist(t){ var dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.sqrt(dx*dx+dy*dy); }
  var touch=null;
  stage.addEventListener('touchstart',function(e){
    if(e.touches.length===1){ touch={mode:'pan', x:e.touches[0].clientX, y:e.touches[0].clientY}; }
    else if(e.touches.length===2){ touch={mode:'pinch', d:tdist(e.touches),
      cx:(e.touches[0].clientX+e.touches[1].clientX)/2, cy:(e.touches[0].clientY+e.touches[1].clientY)/2}; }
  }, {passive:false});
  stage.addEventListener('touchmove',function(e){
    if(!touch) return;
    e.preventDefault();
    if(touch.mode==='pan' && e.touches.length===1){
      tx+=e.touches[0].clientX-touch.x; ty+=e.touches[0].clientY-touch.y;
      touch.x=e.touches[0].clientX; touch.y=e.touches[0].clientY; apply();
    } else if(touch.mode==='pinch' && e.touches.length===2){
      var nd=tdist(e.touches); if(!touch.d){ touch.d=nd; return; }
      var f=nd/touch.d, r=stage.getBoundingClientRect();
      var mx=touch.cx-r.left, my=touch.cy-r.top;
      tx=mx-(mx-tx)*f; ty=my-(my-ty)*f; scale*=f; touch.d=nd; apply();
    }
  }, {passive:false});
  stage.addEventListener('touchend',function(e){ if(e.touches.length===0) touch=null; });

  function resetView(){ tx=40; ty=20; scale=1; apply(); }

  document.getElementById('search').addEventListener('keydown',function(e){
    if(e.key!=='Enter') return;
    var q=e.target.value.trim().toLowerCase(); if(!q) return;
    var hit=null;
    for(var i=0;i<all.length;i++){
      var n=all[i];
      if(((n.name||'')+(n.name_hi||'')).toLowerCase().indexOf(q)>=0){ hit=n; break; }
    }
    if(!hit) return;
    var c=parentOf[hit.id]; while(c){ c._collapsed=false; c=parentOf[c.id]; }
    render();
    var r=stage.getBoundingClientRect();
    scale=1; tx=r.width/2-(hit.x+NODE_W/2); ty=r.height/2-(hit.y+NODE_H/2); apply();
    highlight(hit.id);
  });

  var langBtns=document.querySelectorAll('#toolbar [data-lang]');
  for(var i=0;i<langBtns.length;i++){
    langBtns[i].addEventListener('click', (function(b){ return function(){ lang=b.getAttribute('data-lang'); render(); }; })(langBtns[i]));
  }
  document.getElementById('reset').addEventListener('click', resetView);

  document.getElementById('summary').textContent=
    'People '+summary.total+' · Generations '+summary.generations+
    ' · Uncertain '+summary.uncertain+' · Needs-parent '+summary.needs_parent;

  var up=document.getElementById('unlinked');
  if(unlinked.length){
    var html='<h4>Unlinked — to place</h4>';
    unlinked.forEach(function(p){
      html+='<div>• '+(p.name||p.name_hi||p.id)+(p.note?' <em>('+p.note+')</em>':'')+'</div>';
    });
    up.innerHTML=html;
  } else {
    up.className='empty';
  }

  render(); resetView();
})();
</script>
</body>
</html>
"""
