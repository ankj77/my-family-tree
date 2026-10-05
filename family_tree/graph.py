from typing import Iterable, List, Optional, Set, Tuple

PERSON_COLUMNS = (
    "id", "family_id", "father_id", "mother_id", "father_name", "mother_name",
    "name", "name_hi", "gender", "life", "born", "died", "status", "note", "sort_order",
    "address_line", "address_locality", "address_city", "address_state", "address_country",
    "origin_village", "origin_district", "origin_state",
)


class Graph:
    def __init__(self, people: List[dict], marriages: List[Tuple[str, str]],
                 families: List[dict], villages: List[dict], account_ids: Iterable[str] = ()):
        self.people = {p["id"]: p for p in people}
        self.marriages = [tuple(m) for m in marriages]
        self.families = {f["id"]: f for f in families}
        self.villages = {v["id"]: v for v in villages}
        self.account_ids = set(account_ids)
        self.spouse = {}
        for husband, wife in self.marriages:
            self.spouse[husband] = wife
            self.spouse[wife] = husband
        self.kids = {pid: [] for pid in self.people}
        for pid in self.people:
            parent = self.tree_parent(pid)
            if parent is not None:
                self.kids[parent].append(pid)

    def tree_parent(self, pid: str) -> Optional[str]:
        person = self.people[pid]
        family = person.get("family_id")
        if family is None:
            return None
        for key in ("father_id", "mother_id"):
            parent = person.get(key)
            if parent in self.people and self.people[parent].get("family_id") == family:
                return parent
        return None

    def children_of(self, pid: str) -> List[str]:
        return [
            cid for cid, row in self.people.items()
            if row.get("father_id") == pid or row.get("mother_id") == pid
        ]

    def branch(self, root_id: str) -> Set[str]:
        members, stack = set(), [root_id]
        while stack:
            pid = stack.pop()
            if pid in members or pid not in self.people:
                continue
            members.add(pid)
            stack.extend(self.kids[pid])
        return members | {self.spouse[m] for m in members if m in self.spouse}

    def home_family(self, pid: str) -> Optional[str]:
        family = self.people[pid].get("family_id")
        if family is None and pid in self.spouse:
            family = self.people[self.spouse[pid]].get("family_id")
        return family

    def village_of(self, pid: str) -> Optional[str]:
        family = self.home_family(pid)
        return self.families[family]["village_id"] if family in self.families else None
