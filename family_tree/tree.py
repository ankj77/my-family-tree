from dataclasses import dataclass
from typing import Dict, List, Tuple

from family_tree.model import Person, PARENT_RELATIONS, SPOUSE_RELATIONS


@dataclass
class Summary:
    total: int
    generations: int
    uncertain: int
    needs_parent: int


def _node(person, children_by_parent, spouses_by_person):
    node = {
        "person": person,
        # kept as "wives" for the viewer; holds whoever married in (husband/wife)
        "wives": spouses_by_person.get(person.id, []),
        "children": [],
    }
    for child in children_by_parent.get(person.id, []):
        node["children"].append(_node(child, children_by_parent, spouses_by_person))
    return node


def _depth(node) -> int:
    if not node["children"]:
        return 1
    return 1 + max(_depth(c) for c in node["children"])


def build_tree(people: List[Person]) -> Tuple[dict, List[Person], Summary]:
    index = {p.id: i for i, p in enumerate(people)}
    children_by_parent: Dict[str, List[Person]] = {}
    spouses_by_person: Dict[str, List[Person]] = {}
    for p in people:
        if p.relation_id is None:
            continue
        if p.relation in PARENT_RELATIONS:
            children_by_parent.setdefault(p.relation_id, []).append(p)
        elif p.relation in SPOUSE_RELATIONS:
            spouses_by_person.setdefault(p.relation_id, []).append(p)

    # Order siblings left-to-right by `order` (lower first); those without an
    # `order` fall after, keeping their original file order (stable sort).
    NO_ORDER = 10 ** 9
    for siblings in children_by_parent.values():
        siblings.sort(key=lambda p: (p.order if p.order is not None else NO_ORDER, index[p.id]))

    root_person = next(
        p for p in people
        if p.relation is None and p.status != "needs-parent"
    )
    root = _node(root_person, children_by_parent, spouses_by_person)
    unlinked = [p for p in people if p.status == "needs-parent"]
    summary = Summary(
        total=len(people),
        generations=_depth(root),
        uncertain=sum(1 for p in people if p.status == "uncertain"),
        needs_parent=len(unlinked),
    )
    return root, unlinked, summary
