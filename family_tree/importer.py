from family_tree.model import SPOUSE_RELATIONS, load_people
from family_tree.validate import validate

VILLAGE = {"id": "bakheta", "name": "Bakheta", "district": None, "state": "Haryana"}
FAMILY = {"id": "bakheta", "village_id": "bakheta", "name": "Bakheta", "root_person_id": "ramkrishan"}


def rows_from_yaml(path: str) -> dict:
    people = load_people(path)
    validate(people)
    husband_of = {p.relation_id: p.id for p in people if p.relation == "husband"}
    rows, marriages = [], []
    for p in people:
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
            "origin_village": p.origin.get("village"),
            "origin_district": p.origin.get("district"),
            "origin_state": p.origin.get("state"),
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
    return {"villages": [dict(VILLAGE)], "families": [dict(FAMILY)], "people": rows, "marriages": marriages}
