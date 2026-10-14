from collections import Counter, defaultdict, deque
from typing import Dict, List, Optional, Tuple

from family_tree.graph import Graph

PARENT = {"male": "father", "female": "mother"}
CHILD = {"male": "son", "female": "daughter"}
SPOUSE = {"male": "husband", "female": "wife"}
MARRIAGE = {"husband", "wife", "spouse"}


def _word(graph: Graph, words: dict, pid: str, neutral: str) -> str:
    return words.get(graph.people[pid].get("gender"), neutral)


def children_index(graph: Graph) -> Dict[str, List[str]]:
    kids = defaultdict(list)
    for pid, row in sorted(graph.people.items()):
        for key in ("father_id", "mother_id"):
            if row.get(key) in graph.people:
                kids[row[key]].append(pid)
    return kids


def neighbours(graph: Graph, kids: Dict[str, List[str]], pid: str) -> List[Tuple[str, str]]:
    row = graph.people[pid]
    out = [(row[key], _word(graph, PARENT, row[key], "parent"))
           for key in ("father_id", "mother_id") if row.get(key) in graph.people]
    out += [(kid, _word(graph, CHILD, kid, "child")) for kid in kids.get(pid, [])]
    if pid in graph.spouse:
        out.append((graph.spouse[pid], _word(graph, SPOUSE, graph.spouse[pid], "spouse")))
    return out


def person_path(graph: Graph, a: str, b: str) -> Optional[List[dict]]:
    if a not in graph.people or b not in graph.people:
        return None
    kids = children_index(graph)
    reached = {a: (0, None, None)}
    frontier = [a]
    while frontier and b not in reached:
        found = {}
        for pid in frontier:
            for other, rel in neighbours(graph, kids, pid):
                if other in reached:
                    continue
                marriages = reached[pid][0] + (rel in MARRIAGE)
                if other not in found or marriages < found[other][0]:
                    found[other] = (marriages, pid, rel)
        reached.update(found)
        frontier = list(found)
    if b not in reached:
        return None
    steps, pid = [], b
    while pid is not None:
        _, prev, rel = reached[pid]
        steps.append({"id": pid, "rel": rel})
        pid = prev
    return steps[::-1]


def segments(steps: List[dict]) -> List[List[int]]:
    out = [[]]
    for i, step in enumerate(steps):
        if step["rel"] in MARRIAGE:
            out.append([])
        out[-1].append(i)
    return out


def birth_village(graph: Graph, pid: str) -> Optional[str]:
    row = graph.people[pid]
    if row.get("family_id") in graph.families:
        return graph.families[row["family_id"]]["village_id"]
    return row.get("origin_village_id")


def village_marriages(graph: Graph) -> List[Tuple[str, str, str, str]]:
    out = []
    for husband, wife in sorted(graph.marriages):
        his, hers = birth_village(graph, husband), birth_village(graph, wife)
        if his and hers and his != hers:
            out.append((husband, wife, his, hers))
    return out


def village_links(graph: Graph, vid: str) -> List[dict]:
    counts = Counter()
    for _, _, his, hers in village_marriages(graph):
        if vid in (his, hers):
            counts[hers if his == vid else his] += 1
    return [{"village_id": v, "marriages": n} for v, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def village_pair(graph: Graph, a: str, b: str) -> dict:
    marriages = village_marriages(graph)
    couples = [(h, w) for h, w, his, hers in marriages if {his, hers} == {a, b}]
    if couples or a == b:
        return {"couples": couples, "chain": None}
    edges = defaultdict(dict)
    for h, w, his, hers in marriages:
        edges[his].setdefault(hers, (h, w))
        edges[hers].setdefault(his, (h, w))
    came_from = {a: None}
    queue = deque([a])
    while queue and b not in came_from:
        here = queue.popleft()
        for there in sorted(edges[here]):
            if there not in came_from:
                came_from[there] = here
                queue.append(there)
    if b not in came_from:
        return {"couples": [], "chain": None}
    chain, here = [], b
    while came_from[here] is not None:
        prev = came_from[here]
        chain.append({"from": prev, "to": here, "couple": edges[prev][here]})
        here = prev
    return {"couples": [], "chain": chain[::-1]}
