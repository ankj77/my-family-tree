from dataclasses import dataclass
from typing import List, Optional

import yaml

ALLOWED_KEYS = {"id", "name", "name_hi", "father", "spouse", "born", "note", "status"}
ALLOWED_STATUS = {"uncertain", "needs-parent"}


class LoadError(Exception):
    pass


@dataclass
class Person:
    id: str
    name: Optional[str] = None
    name_hi: Optional[str] = None
    father: Optional[str] = None
    spouse: Optional[str] = None
    born: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None

    def display_name(self) -> str:
        return self.name or self.name_hi or self.id


def load_people(path: str) -> List[Person]:
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
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
        status = entry.get("status")
        if status is not None and status not in ALLOWED_STATUS:
            raise LoadError("Person '%s' has invalid status '%s'" % (entry["id"], status))
        people.append(
            Person(
                id=str(entry["id"]),
                name=entry.get("name"),
                name_hi=entry.get("name_hi"),
                father=entry.get("father"),
                spouse=entry.get("spouse"),
                born=entry.get("born"),
                note=entry.get("note"),
                status=status,
            )
        )
    return people
