from dataclasses import dataclass
from typing import Dict, List, Tuple

from family_tree.model import Person, PARENT_RELATIONS, SPOUSE_RELATIONS


@dataclass
class Summary:
    total: int
    generations: int
    uncertain: int
    needs_parent: int


OPPOSITE_GENDER = {"male": "female", "female": "male"}


def _child_groups(children, spouses):
    child_ids = [c["person"].id for c in children]
    if not child_ids:
        return []
    if len(spouses) <= 1:
        return [{
            "spouse_id": spouses[0].id if spouses else None,
            "unattributed": False,
            "child_ids": child_ids,
        }]
    groups = [
        {"spouse_id": s.id, "unattributed": False, "child_ids": []}
        for s in spouses
    ]
    by_spouse = {g["spouse_id"]: g for g in groups}
    loose = []
    for c in children:
        group = by_spouse.get(c["person"].mother_id)
        if group is None:
            loose.append(c["person"].id)
        else:
            group["child_ids"].append(c["person"].id)
    if loose:
        groups.append({"spouse_id": None, "unattributed": True, "child_ids": loose})
    return groups


def _node(person, children_by_parent, spouses_by_person):
    spouses = spouses_by_person.get(person.id, [])
    children = [
        _node(child, children_by_parent, spouses_by_person)
        for child in children_by_parent.get(person.id, [])
    ]
    placeholder = None
    if children and not spouses:
        placeholder = OPPOSITE_GENDER.get(person.gender)
    return {
        "person": person,
        "spouses": spouses,
        "placeholder": placeholder,
        "child_groups": _child_groups(children, spouses),
        "children": children,
    }


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
