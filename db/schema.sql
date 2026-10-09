CREATE TABLE villages (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  district VARCHAR(200) NULL,
  state VARCHAR(200) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE families (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  village_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  CONSTRAINT fk_family_village FOREIGN KEY (village_id) REFERENCES villages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE people (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  family_id VARCHAR(64) NULL,
  father_id VARCHAR(64) NULL,
  mother_id VARCHAR(64) NULL,
  father_name VARCHAR(200) NULL,
  mother_name VARCHAR(200) NULL,
  name VARCHAR(200) NULL,
  name_hi VARCHAR(200) NULL,
  gender ENUM('male','female') NULL,
  life ENUM('living','deceased') NOT NULL DEFAULT 'living',
  born VARCHAR(100) NULL,
  died VARCHAR(100) NULL,
  status ENUM('uncertain','needs-parent','gap') NULL,
  note TEXT NULL,
  sort_order INT NULL,
  address_line VARCHAR(200) NULL,
  address_locality VARCHAR(200) NULL,
  address_city VARCHAR(200) NULL,
  address_state VARCHAR(200) NULL,
  address_country VARCHAR(200) NULL,
  origin_village_id VARCHAR(64) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  updated_by VARCHAR(64) NULL,
  CONSTRAINT fk_person_family FOREIGN KEY (family_id) REFERENCES families(id),
  CONSTRAINT fk_person_origin_village FOREIGN KEY (origin_village_id) REFERENCES villages(id),
  CONSTRAINT fk_person_father FOREIGN KEY (father_id) REFERENCES people(id) ON DELETE RESTRICT,
  CONSTRAINT fk_person_mother FOREIGN KEY (mother_id) REFERENCES people(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE marriages (
  husband_id VARCHAR(64) NOT NULL,
  wife_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (husband_id, wife_id),
  UNIQUE KEY uq_marriage_husband (husband_id),
  UNIQUE KEY uq_marriage_wife (wife_id),
  CONSTRAINT fk_marriage_husband FOREIGN KEY (husband_id) REFERENCES people(id) ON DELETE CASCADE,
  CONSTRAINT fk_marriage_wife FOREIGN KEY (wife_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE accounts (
  person_id VARCHAR(64) NOT NULL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_username (username),
  CONSTRAINT fk_account_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE role_grants (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  scope ENUM('global','village','branch') NOT NULL,
  scope_id VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uq_grant (person_id, scope, scope_id),
  CONSTRAINT fk_grant_account FOREIGN KEY (person_id) REFERENCES accounts(person_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_session_account FOREIGN KEY (person_id) REFERENCES accounts(person_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE delete_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  requested_by VARCHAR(64) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME NULL,
  CONSTRAINT fk_request_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE change_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id VARCHAR(64) NOT NULL,
  person_id VARCHAR(64) NULL,
  action VARCHAR(32) NOT NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  KEY ix_change_log_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
