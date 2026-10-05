from typing import List, Optional

from family_tree.graph import Graph

RANK = {"branch": 1, "village": 2, "global": 3}


class Access:
    def __init__(self, graph: Graph, grants: List[dict], actor_id: str):
        self.graph = graph
        self.grants = grants
        self.actor_id = actor_id
        self.mine = [g for g in grants if g["person_id"] == actor_id]
        self.is_global = any(g["scope"] == "global" for g in self.mine)

    def admin_villages(self) -> set:
        return {g["scope_id"] for g in self.mine if g["scope"] == "village"}

    def is_admin(self) -> bool:
        return self.is_global or bool(self.admin_villages())

    def rank_of(self, pid: str) -> int:
        return max([RANK[g["scope"]] for g in self.grants if g["person_id"] == pid] or [0])

    def level(self, pid: str) -> Optional[str]:
        if pid not in self.graph.people:
            return None
        if self.is_global or self.graph.village_of(pid) in self.admin_villages():
            return "admin"
        for grant in self.mine:
            if grant["scope"] == "branch" and pid in self.graph.branch(grant["scope_id"]):
                return "branch"
        return None

    def can_edit(self, pid: str) -> bool:
        return self.level(pid) is not None

    def is_admin_over(self, pid: str) -> bool:
        return self.level(pid) == "admin"

    def delete_mode(self, pid: str) -> Optional[str]:
        return {"admin": "direct", "branch": "request"}.get(self.level(pid))

    def can_manage_account(self, pid: str) -> bool:
        return self.is_admin_over(pid) and self.rank_of(pid) <= self.rank_of(self.actor_id)

    def can_grant(self, scope: str, scope_id: str) -> bool:
        if scope in ("global", "village"):
            return self.is_global
        if scope == "branch":
            return self.is_admin_over(scope_id)
        return False

    def can_create_family(self, village_id: str) -> bool:
        return self.is_global or village_id in self.admin_villages()
