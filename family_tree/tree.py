from dataclasses import dataclass
from typing import Dict, List, Tuple

from family_tree.model import Person


@dataclass
class Summary:
    total: int
    generations: int
    uncertain: int
    needs_parent: int


def _node(person, children_by_father, wives_by_husband):
    node = {
        "person": person,
        "wives": wives_by_husband.get(person.id, []),
        "children": [],
    }
    for child in children_by_father.get(person.id, []):
        node["children"].append(_node(child, children_by_father, wives_by_husband))
    return node


def _depth(node) -> int:
    if not node["children"]:
        return 1
    return 1 + max(_depth(c) for c in node["children"])


def build_tree(people: List[Person]) -> Tuple[dict, List[Person], Summary]:
    children_by_father: Dict[str, List[Person]] = {}
    wives_by_husband: Dict[str, List[Person]] = {}
    for p in people:
        if p.spouse is not None:
            wives_by_husband.setdefault(p.spouse, []).append(p)
        elif p.father is not None:
            children_by_father.setdefault(p.father, []).append(p)

    root_person = next(
        p for p in people
        if p.father is None and p.spouse is None and p.status != "needs-parent"
    )
    root = _node(root_person, children_by_father, wives_by_husband)
    unlinked = [p for p in people if p.status == "needs-parent"]
    summary = Summary(
        total=len(people),
        generations=_depth(root),
        uncertain=sum(1 for p in people if p.status == "uncertain"),
        needs_parent=len(unlinked),
    )
    return root, unlinked, summary
