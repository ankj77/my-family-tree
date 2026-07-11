from typing import List, Optional

from family_tree.model import Person, PARENT_RELATIONS


class ValidationError(Exception):
    pass


def _first_cycle(people: List[Person]) -> Optional[str]:
    """Walk each person's parent chain (father/mother links); return the id of the
    first person revisited within a walk, or None if there are no cycles."""
    by_id = {p.id: p for p in people}
    for start in people:
        seen = set()
        cur = start
        while cur is not None and cur.relation in PARENT_RELATIONS and cur.relation_id is not None:
            if cur.id in seen:
                return cur.id
            seen.add(cur.id)
            cur = by_id.get(cur.relation_id)
    return None


def validate(people: List[Person]) -> List[str]:
    ids = [p.id for p in people]
    dupes = sorted({x for x in ids if ids.count(x) > 1})
    if dupes:
        raise ValidationError("Duplicate id(s): %s" % dupes)

    by_id = {p.id: p for p in people}
    for p in people:
        if not p.name and not p.name_hi:
            raise ValidationError("Person '%s' has neither name nor name_hi" % p.id)
        has_rel = p.relation is not None
        has_rid = p.relation_id is not None
        if has_rel != has_rid:
            raise ValidationError(
                "Person '%s' must have both 'relation' and 'relation_id' or neither" % p.id
            )
        if has_rid and p.relation_id not in by_id:
            raise ValidationError(
                "Person '%s' relation_id '%s' does not exist" % (p.id, p.relation_id)
            )
        if has_rid and p.relation_id == p.id:
            raise ValidationError("Person '%s' is related to itself" % p.id)

    cyc = _first_cycle(people)
    if cyc is not None:
        raise ValidationError("Cycle detected in parent chain at '%s'" % cyc)

    roots = [
        p for p in people
        if p.relation is None and p.status != "needs-parent"
    ]
    if len(roots) == 0:
        raise ValidationError("No root found (a single ancestor with no relation is required)")
    if len(roots) > 1:
        raise ValidationError(
            "Expected exactly one root, found %d: %s" % (len(roots), [p.id for p in roots])
        )

    warnings = []
    needs = [p.id for p in people if p.status == "needs-parent"]
    if needs:
        warnings.append("%d person(s) need a parent: %s" % (len(needs), needs))
    uncertain = [p.id for p in people if p.status == "uncertain"]
    if uncertain:
        warnings.append("%d name(s) uncertain: %s" % (len(uncertain), uncertain))
    return warnings
