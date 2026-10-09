from family_tree import naming
from family_tree.model import SPOUSE_RELATIONS, load_people
from family_tree.validate import validate

VILLAGE = {"id": "bakheta", "name": "Bakheta", "district": None, "state": "Haryana"}
FAMILY = {"id": "bakheta", "village_id": "bakheta", "name": "Bakheta"}


def origin_village_ids(origins, villages):
    by_name = {v["name"].lower(): v for v in villages}
    ids = []
    for origin in origins:
        name = (origin.get("village") or "").strip()
        if not name:
            ids.append(None)
            continue
        village = by_name.get(name.lower())
        if village is None:
            village = {"id": naming.slug(name, {v["id"] for v in villages}, fallback="village"),
                       "name": name, "district": None, "state": None}
            villages.append(village)
            by_name[name.lower()] = village
        for key in ("district", "state"):
            village[key] = village.get(key) or origin.get(key) or None
        ids.append(village["id"])
    return ids


def rows_from_yaml(path: str) -> dict:
    people = load_people(path)
    validate(people)
    villages = [dict(VILLAGE)]
    origin_ids = origin_village_ids([p.origin for p in people], villages)
    husband_of = {p.relation_id: p.id for p in people if p.relation == "husband"}
    rows, marriages = [], []
    for p, origin_id in zip(people, origin_ids):
        married_in = p.relation in SPOUSE_RELATIONS
        row = {
            "id": p.id,
            "family_id": None if married_in else FAMILY["id"],
            "father_id": None,
            "mother_id": None,
            "father_name": p.father,
            "mother_name": p.mother,
            "name": p.name,
            "name_hi": p.name_hi,
            "gender": p.gender,
            "life": p.life or "living",
            "born": p.born,
            "died": p.died,
            "status": p.status,
            "note": p.note,
            "sort_order": p.order,
            "address_line": p.address.line,
            "address_locality": p.address.locality,
            "address_city": p.address.city,
            "address_state": p.address.state,
            "address_country": p.address.country,
            "address_abroad": None,
            "origin_village_id": origin_id,
        }
        if p.relation == "father":
            row["father_id"] = p.relation_id
        elif p.relation == "mother":
            row["mother_id"] = p.relation_id
            row["father_id"] = husband_of.get(p.relation_id)
        elif p.relation == "wife":
            marriages.append((p.relation_id, p.id))
        elif p.relation == "husband":
            marriages.append((p.id, p.relation_id))
        rows.append(row)
    return {"villages": villages, "families": [dict(FAMILY)], "people": rows, "marriages": marriages}
