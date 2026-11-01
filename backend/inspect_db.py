"""AEGIS Development Database Verification & Inspection Script.

Performs read-only inspection of the active SQLite database file,
verifies PRAGMAs, tables, columns, constraints, indexes, triggers,
and tests audit protection in a temporary isolated database.
"""

import os
from pathlib import Path
import sqlite3
import sys

# Ensure backend directory is in path
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
from app.database import AUDIT_NO_DELETE_TRIGGER, AUDIT_NO_UPDATE_TRIGGER
from app.models import Base

EXPECTED_TABLES = [
    "users",
    "patients",
    "registrations",
    "uploaded_documents",
    "permission_scopes",
    "user_permissions",
    "audit_events",
    "revoked_tokens",
]


def inspect_live_database():
    settings = get_settings()
    db_path = settings.DATA_DIR / "patient_registration.db"

    print("=" * 80)
    print("AEGIS LIVE DATABASE INSPECTION REPORT")
    print("=" * 80)
    print(f"Target Database File: {db_path}")
    print(f"File Exists:         {db_path.exists()}")
    if db_path.exists():
        print(f"File Size:           {os.path.getsize(db_path)} bytes")
    print("-" * 80)

    if not db_path.exists():
        print("ERROR: Database file does not exist!")
        return False

    # Connect to database using URI in read-only mode to guarantee no mutation
    uri = f"file:{db_path.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    cursor = conn.cursor()

    # 1. Inspect PRAGMAs
    print("\n[1] SQLite Runtime PRAGMAs:")
    journal_mode = cursor.execute("PRAGMA journal_mode;").fetchone()[0]
    print(f"  - journal_mode:       {journal_mode} (Expected: wal)")

    # Test connection-level foreign_keys
    cursor.execute("PRAGMA foreign_keys = ON;")
    fk_status = cursor.execute("PRAGMA foreign_keys;").fetchone()[0]
    print(f"  - foreign_keys:       {fk_status} (1 = ON, 0 = OFF)")

    cursor.execute(f"PRAGMA busy_timeout = {settings.DB_BUSY_TIMEOUT};")
    busy_timeout = cursor.execute("PRAGMA busy_timeout;").fetchone()[0]
    print(f"  - busy_timeout:       {busy_timeout} ms")

    # 2. Inspect Tables
    print("\n[2] Tables in sqlite_master:")
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    )
    actual_tables = [row[0] for row in cursor.fetchall()]
    print(f"  Found {len(actual_tables)} tables: {actual_tables}")
    missing_tables = set(EXPECTED_TABLES) - set(actual_tables)
    extra_tables = set(actual_tables) - set(EXPECTED_TABLES)
    print(f"  Missing tables:       {list(missing_tables) if missing_tables else 'None'}")
    print(f"  Extra tables:         {list(extra_tables) if extra_tables else 'None'}")

    # 3. Inspect Columns, Foreign Keys, Indexes per Table
    print("\n[3] Table Schemas & Constraints:")
    for table in EXPECTED_TABLES:
        if table not in actual_tables:
            print(f"\n  [!] Table '{table}' MISSING!")
            continue

        print(f"\n  TABLE: {table}")
        # Columns
        cols = cursor.execute(f"PRAGMA table_info({table});").fetchall()
        print(f"    Columns ({len(cols)}):")
        for col in cols:
            cid, name, col_type, notnull, dflt_value, pk = col
            nullable_str = "NOT NULL" if notnull else "NULL"
            pk_str = " [PK]" if pk else ""
            default_str = f" DEFAULT {dflt_value}" if dflt_value is not None else ""
            print(f"      - {name:<30} {col_type:<15} {nullable_str:<10}{default_str}{pk_str}")

        # Foreign Keys
        fks = cursor.execute(f"PRAGMA foreign_key_list({table});").fetchall()
        if fks:
            print(f"    Foreign Keys ({len(fks)}):")
            for fk in fks:
                # fk: (id, seq, table, from, to, on_update, on_delete, match)
                print(f"      - {fk[3]} -> {fk[2]}({fk[4]}) ON DELETE {fk[6]} ON UPDATE {fk[5]}")

        # Indexes
        indexes = cursor.execute(f"PRAGMA index_list({table});").fetchall()
        if indexes:
            print(f"    Indexes ({len(indexes)}):")
            for idx in indexes:
                seq, idx_name, unique, origin, partial = idx
                idx_type = "UNIQUE" if unique else "INDEX"
                idx_cols = cursor.execute(f"PRAGMA index_info({idx_name});").fetchall()
                col_names = [c[2] for c in idx_cols]
                print(f"      - {idx_name:<35} {idx_type:<8} on ({', '.join(col_names)})")

    # 4. Inspect Triggers
    print("\n[4] Database Triggers in sqlite_master:")
    cursor.execute(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name;"
    )
    triggers = cursor.fetchall()
    print(f"  Found {len(triggers)} triggers:")
    for trig in triggers:
        name, tbl_name, sql = trig
        print(f"  - Trigger: {name} on table '{tbl_name}'")
        # Format SQL indentation
        indented_sql = "\n".join("      " + line for line in sql.strip().splitlines())
        print(f"{indented_sql}")

    conn.close()
    return True


def verify_audit_protection_isolated():
    """Verify audit append-only abort triggers using an isolated in-memory SQLite database."""
    print("\n" + "=" * 80)
    print("[5] AUDIT PROTECTION VERIFICATION (Isolated In-Memory Database)")
    print("=" * 80)

    # Use pure in-memory SQLite to guarantee zero modification to development database
    mem_conn = sqlite3.connect(":memory:")
    cursor = mem_conn.cursor()

    # Create audit_events table with exact schema
    cursor.execute("""
    CREATE TABLE audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%SZ', 'now')),
        actor_user_id INTEGER,
        actor_username TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        action_type TEXT NOT NULL,
        target_entity_type TEXT,
        target_entity_id TEXT,
        clinical_justification TEXT,
        metadata_json TEXT
    );
    """)

    # Create the two approved audit triggers
    cursor.execute(AUDIT_NO_UPDATE_TRIGGER)
    cursor.execute(AUDIT_NO_DELETE_TRIGGER)

    # Step A: Insert valid audit event
    cursor.execute("""
    INSERT INTO audit_events (actor_username, actor_role, action_type)
    VALUES ('audit_officer', 'ROLE_SUPER_USER', 'TEST_EVENT');
    """)
    mem_conn.commit()
    audit_id = cursor.lastrowid
    print(f"  [+] Legitimate audit event inserted (id={audit_id}).")

    # Step B: Test UPDATE rejection
    update_rejected = False
    try:
        cursor.execute(f"UPDATE audit_events SET actor_username = 'tampered' WHERE id = {audit_id};")
        mem_conn.commit()
    except (sqlite3.IntegrityError, sqlite3.OperationalError) as e:
        update_rejected = True
        print(f"  [+] UPDATE operation successfully ABORTED by trigger:")
        print(f"      Error: {e}")

    # Step C: Test DELETE rejection
    delete_rejected = False
    try:
        cursor.execute(f"DELETE FROM audit_events WHERE id = {audit_id};")
        mem_conn.commit()
    except (sqlite3.IntegrityError, sqlite3.OperationalError) as e:
        delete_rejected = True
        print(f"  [+] DELETE operation successfully ABORTED by trigger:")
        print(f"      Error: {e}")

    mem_conn.close()

    assert update_rejected, "Trigger trg_audit_events_no_update FAILED to abort update!"
    assert delete_rejected, "Trigger trg_audit_events_no_delete FAILED to abort delete!"
    print("  [✓] Audit append-only triggers verified successfully in isolation.")


def verify_schema_consistency_with_sqlalchemy():
    """Compare Base.metadata against expected models."""
    print("\n" + "=" * 80)
    print("[6] SCHEMA CONSISTENCY WITH SQLALCHEMY METADATA")
    print("=" * 80)
    metadata_tables = list(Base.metadata.tables.keys())
    print(f"  SQLAlchemy Base.metadata registers {len(metadata_tables)} tables:")
    for t in sorted(metadata_tables):
        cols = [c.name for c in Base.metadata.tables[t].columns]
        print(f"    - {t:<22} ({len(cols)} columns)")

    mismatch = set(EXPECTED_TABLES) ^ set(metadata_tables)
    if mismatch:
        print(f"  [!] Metadata mismatch: {mismatch}")
    else:
        print("  [✓] 100% agreement between Base.metadata and expected 8 tables.")


if __name__ == "__main__":
    success = inspect_live_database()
    if success:
        verify_audit_protection_isolated()
        verify_schema_consistency_with_sqlalchemy()
        print("\n" + "=" * 80)
        print("ALL DATABASE INSPECTIONS AND VERIFICATIONS COMPLETED SUCCESSFULLY.")
        print("=" * 80)
