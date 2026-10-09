from typing import Callable, List, Tuple

from family_tree.graph import Graph
from family_tree.model import Address, Person
from family_tree.render import _node_json, _person_json, summary_json
from family_tree.rules import display
from family_tree.tree import build_tree

VILLAGE_COLUMNS = (("village", "name"), ("district", "district"), ("state", "state"))


def village_place(village: dict) -> dict:
    return {key: village[column] for key, column in VILLAGE_COLUMNS if village.get(column)}


def origin_of(graph: Graph, pid: str, seen=None) -> Tuple[dict, bool]:
    row = graph.people[pid]
    own = graph.villages.get(row.get("origin_village_id"))
    if own:
        return village_place(own), False
    seen = (seen or set()) | {pid}
    father = row.get("father_id")
    if father in graph.people and father not in seen:
        found, _ = origin_of(graph, father, seen)
        return found, bool(found)
    family = graph.families.get(row.get("family_id"))
    if family and graph.roots[row["family_id"]] == pid:
        return village_place(graph.villages[family["village_id"]]), True
    return {}, False


def _parent_text(graph: Graph, row: dict, id_key: str, name_key: str):
    parent = row.get(id_key)
    if parent in graph.people:
        return display(graph.people[parent])
    return row.get(name_key)


def _person(graph: Graph, pid: str, relation, relation_id, as_spouse: bool) -> Person:
    row = graph.people[pid]
    origin, inherited = origin_of(graph, pid)
    return Person(
        id=pid,
        name=row.get("name"),
        name_hi=row.get("name_hi"),
        gender=row.get("gender"),
        relation=relation,
        relation_id=relation_id,
        order=row.get("sort_order"),
        born=row.get("born"),
        life=row.get("life"),
        died=row.get("died"),
        note=row.get("note"),
        status=row.get("status"),
        father=_parent_text(graph, row, "father_id", "father_name") if as_spouse else None,
        mother=_parent_text(graph, row, "mother_id", "mother_name") if as_spouse else None,
        address=Address(
            line=row.get("address_line"),
            locality=row.get("address_locality"),
            city=row.get("address_city"),
            state=row.get("address_state"),
            country=row.get("address_country"),
        ),
        origin=origin,
        origin_inherited=inherited,
    )


def family_people(graph: Graph, family_id: str) -> List[Person]:
    members = [pid for pid, row in graph.people.items() if row.get("family_id") == family_id]
    member_set = set(members)
    root = graph.roots[family_id]
    people = []
    for pid in members:
        parent = graph.tree_parent(pid)
        relation = None
        if parent is not None:
            relation = "father" if graph.people[pid].get("father_id") == parent else "mother"
        person = _person(graph, pid, relation, parent, False)
        if parent is None:
            person.status = None if pid == root else "needs-parent"
        people.append(person)
    wives = {wife for _, wife in graph.marriages}
    for pid in members:
        spouse = graph.spouse.get(pid)
        if spouse is None or spouse in member_set:
            continue
        people.append(_person(graph, spouse, "wife" if spouse in wives else "husband", pid, True))
    return people


def relation_text(graph: Graph, pid: str) -> str:
    row = graph.people[pid]
    child_of = {"male": "s/o", "female": "d/o"}.get(row.get("gender"), "c/o")
    for id_key, name_key in (("father_id", "father_name"), ("mother_id", "mother_name")):
        parent = _parent_text(graph, row, id_key, name_key)
        if parent:
            return "%s %s" % (child_of, parent)
    spouse = graph.spouse.get(pid)
    if spouse:
        married_to = {"male": "h/o", "female": "w/o"}.get(row.get("gender"), "spouse of")
        return "%s %s" % (married_to, display(graph.people[spouse]))
    return ""


def family_links(graph: Graph, pid: str) -> List[dict]:
    links = []
    own = graph.people[pid].get("family_id")
    if own in graph.families:
        links.append({"text": "Born in %s family" % graph.families[own]["name"], "family_id": own})
    spouse = graph.spouse.get(pid)
    theirs = graph.people[spouse].get("family_id") if spouse else None
    if theirs in graph.families and theirs != own:
        links.append({"text": "Married into %s family" % graph.families[theirs]["name"], "family_id": theirs})
    return links


def family_json(graph: Graph, family_id: str, extras: Callable[[str], dict]) -> dict:
    root, unlinked, summary = build_tree(family_people(graph, family_id))
    tree = _node_json(root)
    unlinked_json = [_person_json(p) for p in unlinked]

    def decorate(card):
        card.update(extras(card["id"]))
        for spouse in card.get("spouses", []):
            decorate(spouse)
        for child in card.get("children", []):
            decorate(child)

    decorate(tree)
    for card in unlinked_json:
        decorate(card)
    family = graph.families[family_id]
    return {
        "family": {"id": family_id, "name": family["name"], "village": graph.villages[family["village_id"]]["name"]},
        "tree": tree,
        "unlinked": unlinked_json,
        "summary": summary_json(summary),
    }
