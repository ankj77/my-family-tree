from typing import List, Optional

from family_tree.model import Person


class ValidationError(Exception):
    pass


def _first_cycle(people: List[Person]) -> Optional[str]:
    by_id = {p.id: p for p in people}
    for start in people:
        seen = set()
        cur = start
        while cur is not None and cur.father is not None:
            if cur.id in seen:
                return cur.id
            seen.add(cur.id)
            cur = by_id.get(cur.father)
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
        if p.father is not None and p.spouse is not None:
            raise ValidationError("Person '%s' has both father and spouse" % p.id)
        if p.father is not None and p.father not in by_id:
            raise ValidationError("Person '%s' father '%s' does not exist" % (p.id, p.father))
        if p.spouse is not None and p.spouse not in by_id:
            raise ValidationError("Person '%s' spouse '%s' does not exist" % (p.id, p.spouse))

    cyc = _first_cycle(people)
    if cyc is not None:
        raise ValidationError("Cycle detected in father chain at '%s'" % cyc)

    roots = [
        p for p in people
        if p.father is None and p.spouse is None and p.status != "needs-parent"
    ]
    if len(roots) == 0:
        raise ValidationError("No root found (a single ancestor with no father is required)")
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
