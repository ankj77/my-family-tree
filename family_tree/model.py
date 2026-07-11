from dataclasses import dataclass
from typing import List, Optional

import yaml

ALLOWED_KEYS = {
    "id", "name", "name_hi", "gender", "relation", "relation_id",
    "order", "born", "note", "status",
}
ALLOWED_STATUS = {"uncertain", "needs-parent"}
ALLOWED_RELATION = {"father", "mother", "husband", "wife"}
ALLOWED_GENDER = {"male", "female"}

# A person attaches to the tree by one relation to another person:
#   father / mother  -> relation_id is this person's parent (this person is their child)
#   husband / wife   -> relation_id is this person's spouse (this person married in)
PARENT_RELATIONS = {"father", "mother"}
SPOUSE_RELATIONS = {"husband", "wife"}


class LoadError(Exception):
    pass


@dataclass
class Person:
    id: str
    name: Optional[str] = None
    name_hi: Optional[str] = None
    gender: Optional[str] = None
    relation: Optional[str] = None
    relation_id: Optional[str] = None
    order: Optional[int] = None
    born: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None

    def display_name(self) -> str:
        return self.name or self.name_hi or self.id


def load_people(path: str) -> List[Person]:
    with open(path, "r", encoding="utf-8") as f:
        try:
            data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise LoadError("YAML syntax error in %s: %s" % (path, e))
    if data is None:
        return []
    if not isinstance(data, list):
        raise LoadError("Top-level YAML must be a list of people")
    people = []
    for i, entry in enumerate(data):
        if not isinstance(entry, dict):
            raise LoadError("Person #%d is not a mapping" % i)
        unknown = set(entry) - ALLOWED_KEYS
        if unknown:
            raise LoadError("Person #%d has unknown keys: %s" % (i, sorted(unknown)))
        if not entry.get("id"):
            raise LoadError("Person #%d is missing 'id'" % i)
        pid = entry["id"]
        status = entry.get("status")
        if status is not None and status not in ALLOWED_STATUS:
            raise LoadError("Person '%s' has invalid status '%s'" % (pid, status))
        relation = entry.get("relation")
        if relation is not None and relation not in ALLOWED_RELATION:
            raise LoadError("Person '%s' has invalid relation '%s'" % (pid, relation))
        gender = entry.get("gender")
        if gender is not None and gender not in ALLOWED_GENDER:
            raise LoadError("Person '%s' has invalid gender '%s'" % (pid, gender))
        order = entry.get("order")
        if order is not None and not isinstance(order, int):
            raise LoadError("Person '%s' has non-integer order '%r'" % (pid, order))
        people.append(
            Person(
                id=str(pid),
                name=entry.get("name"),
                name_hi=entry.get("name_hi"),
                gender=gender,
                relation=relation,
                relation_id=entry.get("relation_id"),
                order=order,
                born=entry.get("born"),
                note=entry.get("note"),
                status=status,
            )
        )
    return people
