from collections import Counter, defaultdict, deque
from typing import Dict, List, Optional, Tuple

from family_tree.graph import Graph
from family_tree.render import _person_json
from family_tree.rules import display
from family_tree.views import _person, parent_text

PARENT = {"male": "father", "female": "mother"}
CHILD = {"male": "son", "female": "daughter"}
SPOUSE = {"male": "husband", "female": "wife"}
MARRIAGE = {"husband", "wife", "spouse"}
UP = {"father", "mother", "parent"}
DOWN = {"son", "daughter", "child"}


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


def relation_words(graph: Graph, pid: str) -> str:
    row = graph.people[pid]
    gender = row.get("gender")
    parts = []
    parent = parent_text(graph, row, "father_id", "father_name") or parent_text(graph, row, "mother_id", "mother_name")
    if parent:
        parts.append("%s of %s" % ({"male": "son", "female": "daughter"}.get(gender, "child"), parent))
    if pid in graph.spouse:
        parts.append("%s of %s" % ({"male": "husband", "female": "wife"}.get(gender, "spouse"),
                                   display(graph.people[graph.spouse[pid]])))
    return " · ".join(parts)


PRIVATE_CARD_FIELDS = ("address", "note", "born", "died")


def _card(graph: Graph, pid: str, as_spouse: bool) -> dict:
    card = _person_json(_person(graph, pid, None, None, as_spouse))
    for key in PRIVATE_CARD_FIELDS:
        card.pop(key, None)
    return card


def _move(rel: Optional[str]) -> int:
    return 1 if rel in UP else -1 if rel in DOWN else 0


def chain_layout(steps: List[dict]) -> List[dict]:
    spots = [{"col": 0.0, "gen": 0}]
    col = 0
    for i in range(1, len(steps)):
        move = _move(steps[i]["rel"])
        before = _move(steps[i - 1]["rel"])
        if move == 0:
            col += 1
        elif before and before != move:
            col += 1
            spots[i - 1]["col"] = col - 0.5
        spots.append({"col": float(col), "gen": spots[i - 1]["gen"] + move})
    return spots


def chain_edges(graph: Graph, steps: List[dict]) -> List[dict]:
    edges = []
    for i in range(1, len(steps)):
        a, b, rel = steps[i - 1]["id"], steps[i]["id"], steps[i]["rel"]
        if rel in MARRIAGE:
            edges.append({"from": a, "to": b, "label": "married"})
            continue
        parent, child = (b, a) if rel in UP else (a, b)
        word = {"male": "son", "female": "daughter"}.get(graph.people[child].get("gender"), "child")
        edges.append({"from": parent, "to": child, "label": word})
    return edges


def chain_cards(graph: Graph, steps: List[dict]) -> List[dict]:
    cards = []
    for step, spot in zip(steps, chain_layout(steps)):
        card = _card(graph, step["id"], True)
        card.update(spot, spouses=[], placeholder=None, child_groups=[], children=[])
        cards.append(card)
    return cards


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
