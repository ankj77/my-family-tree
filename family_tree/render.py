import os

from family_tree.model import Person
from family_tree.tree import Summary

WEB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
VIEW_FILES = ("poster.js",)


def _read(*parts) -> str:
    with open(os.path.join(WEB_DIR, *parts), "r", encoding="utf-8") as f:
        return f.read()


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
        "father": p.father,
        "mother": p.mother,
        "address": p.address.as_dict(),
        "origin": p.origin,
        "origin_inherited": p.origin_inherited,
    }


def _node_json(node: dict) -> dict:
    d = _person_json(node["person"])
    d["spouses"] = [_person_json(s) for s in node["spouses"]]
    d["placeholder"] = node["placeholder"]
    d["child_groups"] = node["child_groups"]
    d["children"] = [_node_json(c) for c in node["children"]]
    return d


def summary_json(summary: Summary) -> dict:
    return {
        "total": summary.total,
        "generations": summary.generations,
        "uncertain": summary.uncertain,
        "needs_parent": summary.needs_parent,
        "male": summary.male,
        "female": summary.female,
    }


APP_SCRIPTS = ["app.js"] + ["views/%s" % name for name in VIEW_FILES] + ["filters.js", "api.js", "edit.js"]
ADMIN_SCRIPTS = ["api.js", "admin.js"]


def render_page(template: str, scripts, before: str = "", after: str = "") -> str:
    parts = [before] + [_read(*s.split("/")) for s in scripts if os.path.exists(os.path.join(WEB_DIR, *s.split("/")))] + [after]
    return (
        _read(template)
        .replace("/*__CSS__*/", _read("app.css"))
        .replace("/*__APP_JS__*/", "\n".join(p for p in parts if p))
    )


def render_index() -> str:
    return render_page("index.html", APP_SCRIPTS, after="FT.api.start();")


def render_admin() -> str:
    return render_page("admin.html", ADMIN_SCRIPTS, before="var FT = {};", after="FT.admin.start();")
