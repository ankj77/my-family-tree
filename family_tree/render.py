import json
import os
from typing import List

from family_tree.model import Person
from family_tree.tree import Summary

WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
VIEW_FILES = ("classic.js", "horizontal.js", "poster.js")


def _read(*parts) -> str:
    with open(os.path.join(WEB_DIR, *parts), "r", encoding="utf-8") as f:
        return f.read()


def _script() -> str:
    parts = [_read("app.js")]
    for name in VIEW_FILES:
        if os.path.exists(os.path.join(WEB_DIR, "views", name)):
            parts.append(_read("views", name))
    parts.append("FT.init();")
    return "\n".join(parts)


def _person_json(p: Person) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "name_hi": p.name_hi,
        "gender": p.gender,
        "born": p.born,
        "life": p.life,
        "died": p.died,
        "note": p.note,
        "status": p.status,
        "photo": p.photo,
        "address": p.address.as_dict(),
    }


def _node_json(node: dict) -> dict:
    d = _person_json(node["person"])
    d["spouses"] = [_person_json(s) for s in node["spouses"]]
    d["placeholder"] = node["placeholder"]
    d["child_groups"] = node["child_groups"]
    d["children"] = [_node_json(c) for c in node["children"]]
    return d


# ensure_ascii=False keeps Devanagari readable; escape </ so it can't close the script tag
def _embed(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def render_html(root: dict, unlinked: List[Person], summary: Summary) -> str:
    return (
        _read("index.html")
        .replace("/*__TREE__*/", _embed(_node_json(root)))
        .replace("/*__UNLINKED__*/", _embed([_person_json(p) for p in unlinked]))
        .replace(
            "/*__SUMMARY__*/",
            _embed({
                "total": summary.total,
                "generations": summary.generations,
                "uncertain": summary.uncertain,
                "needs_parent": summary.needs_parent,
            }),
        )
        .replace("/*__CSS__*/", _read("app.css"))
        .replace("/*__APP_JS__*/", _script())
    )
