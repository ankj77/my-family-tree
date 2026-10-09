from family_tree.graph import PERSON_COLUMNS, Graph


def person(pid, **fields):
    row = {column: None for column in PERSON_COLUMNS}
    row.update(id=pid, name=pid.title(), life="living")
    row.update(fields)
    return row


def sample_rows():
    return {
        "villages": [
            {"id": "bakheta", "name": "Bakheta", "district": None, "state": "Haryana"},
            {"id": "pugthala", "name": "Pugthala", "district": None, "state": "Haryana"},
            {"id": "kakroi", "name": "Kakroi", "district": None, "state": None},
        ],
        "families": [
            {"id": "bakheta", "village_id": "bakheta", "name": "Bakheta", "root_person_id": "ram"},
            {"id": "pugthala", "village_id": "pugthala", "name": "Pugthala", "root_person_id": "bash"},
        ],
        "people": [
            person("ram", family_id="bakheta", gender="male", life="deceased", origin_village_id="bakheta"),
            person("jagdish", family_id="bakheta", father_id="ram", gender="male", life="living"),
            person("mohan", family_id="bakheta", father_id="ram", gender="male", life="living"),
            person("sita", gender="female", life="living", father_name="Hari", origin_village_id="kakroi"),
            person("amit", family_id="bakheta", father_id="jagdish", mother_id="rashmi",
                   gender="male", life="living"),
            person("neha", family_id="bakheta", father_id="jagdish", mother_id="rashmi",
                   gender="female", life="living"),
            person("vikram", gender="male", life="living"),
            person("bash", family_id="pugthala", gender="male", life="living"),
            person("rashmi", family_id="pugthala", father_id="bash", gender="female", life="living"),
        ],
        "marriages": [("jagdish", "rashmi"), ("mohan", "sita"), ("vikram", "neha")],
    }


SAMPLE_ACCOUNTS = {"mohan", "jagdish", "amit", "rashmi", "bash"}

SAMPLE_GRANTS = [
    {"id": 1, "person_id": "mohan", "scope": "global", "scope_id": ""},
    {"id": 2, "person_id": "bash", "scope": "village", "scope_id": "pugthala"},
    {"id": 3, "person_id": "jagdish", "scope": "branch", "scope_id": "jagdish"},
]


def sample_graph(rows=None):
    rows = rows or sample_rows()
    return Graph(rows["people"], rows["marriages"], rows["families"], rows["villages"], SAMPLE_ACCOUNTS)
