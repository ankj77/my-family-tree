from typing import Optional

from family_tree.graph import Graph


class RuleError(Exception):
    pass


TEXT_FIELDS = {
    key: 200 for key in (
        "name", "name_hi", "father_name", "mother_name",
        "address_line", "address_locality", "address_city", "address_state", "address_country",
    )
}
TEXT_FIELDS.update({"born": 100, "died": 100, "note": 2000, "address_abroad": 500})
CHOICES = {
    "gender": {"male", "female"},
    "life": {"living", "deceased"},
    "status": {"uncertain", "needs-parent", "gap"},
}
LINK_FIELDS = ("father_id", "mother_id", "family_id")
EDIT_FIELDS = tuple(TEXT_FIELDS) + tuple(CHOICES) + ("sort_order", "origin_village_id")


def display(row: dict) -> str:
    return row.get("name") or row.get("name_hi") or row["id"]


def clean_fields(data: dict, allowed) -> dict:
    unknown = set(data) - set(allowed)
    if unknown:
        raise RuleError("Unknown field(s): %s" % ", ".join(sorted(unknown)))
    out = {}
    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip() or None
        if value is None:
            if key == "life":
                raise RuleError("life must be living or deceased")
            out[key] = None
            continue
        if key in TEXT_FIELDS:
            if not isinstance(value, str):
                raise RuleError("%s must be text" % key)
            if len(value) > TEXT_FIELDS[key]:
                raise RuleError("%s is longer than %d characters" % (key, TEXT_FIELDS[key]))
        elif key in CHOICES:
            if not isinstance(value, str) or value not in CHOICES[key]:
                raise RuleError("%s must be one of: %s" % (key, ", ".join(sorted(CHOICES[key]))))
        elif key == "sort_order":
            if isinstance(value, bool) or not isinstance(value, int):
                raise RuleError("sort_order must be a whole number")
        elif not isinstance(value, str):
            raise RuleError("%s must be an id" % key)
        out[key] = value
    return out


def _parents(people, pid):
    row = people[pid]
    return [p for p in (row.get("father_id"), row.get("mother_id")) if p in people]


def _cycle_at(people) -> Optional[str]:
    done = set()
    for start in people:
        if start in done:
            continue
        stack = [(start, iter(_parents(people, start)))]
        on_path = {start}
        while stack:
            node, parents = stack[-1]
            nxt = next(parents, None)
            if nxt is None:
                stack.pop()
                on_path.discard(node)
                done.add(node)
            elif nxt in on_path:
                return nxt
            elif nxt not in done:
                on_path.add(nxt)
                stack.append((nxt, iter(_parents(people, nxt))))
    return None


def check(graph: Graph) -> None:
    people = graph.people
    for row in people.values():
        if not row.get("name") and not row.get("name_hi"):
            raise RuleError("Every person needs a name or a Hindi name")
    looped = _cycle_at(people)
    if looped:
        raise RuleError("%s would become their own ancestor" % display(people[looped]))
    married = set()
    for husband, wife in graph.marriages:
        for pid in (husband, wife):
            if pid in married:
                raise RuleError("%s already has a spouse" % display(people[pid]))
            married.add(pid)
        family = people[husband].get("family_id")
        if family is not None and family == people[wife].get("family_id"):
            raise RuleError(
                "%s and %s are in the same family; a marriage joins two families"
                % (display(people[husband]), display(people[wife]))
            )
    for family_id, family in graph.families.items():
        root = graph.roots[family_id]
        for pid, row in people.items():
            if (row.get("family_id") == family_id and pid != root
                    and graph.tree_parent(pid) is None and row.get("status") != "needs-parent"):
                raise RuleError("%s has no parent in the %s family" % (display(row), family["name"]))
    for pid in graph.account_ids:
        if pid in people and people[pid].get("life") != "living":
            raise RuleError("%s has a login, so must be marked living (remove the login first)"
                            % display(people[pid]))


def delete_blocker(graph: Graph, pid: str) -> Optional[str]:
    person = graph.people[pid]
    for family_id, family in graph.families.items():
        if graph.roots[family_id] == pid:
            return "%s is the root of the %s family and cannot be deleted" % (display(person), family["name"])
    kids = graph.children_of(pid)
    if kids:
        names = ", ".join(display(graph.people[k]) for k in kids[:3])
        return "%s has children (%s); delete or move them first" % (display(person), names)
    spouse = graph.spouse.get(pid)
    if spouse and person.get("family_id") is not None and graph.people[spouse].get("family_id") is None:
        other = display(graph.people[spouse])
        return "%s married in and is linked only through %s; delete %s first" % (other, display(person), other)
    return None
