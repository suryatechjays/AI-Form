import sqlite3
import shutil
import os
from pathlib import Path
from datetime import datetime

src_path = Path("backend/data/patient_registration.db")
assert src_path.exists(), f"Source DB does not exist at {src_path}"

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_path = Path(f"backend/data/patient_registration_backup_{timestamp}.db")

# Flush WAL by opening connection and checkpointing
conn = sqlite3.connect(src_path)
conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
conn.close()

# Perform backup using sqlite3 online backup API for 100% lock-safe snapshot
src_conn = sqlite3.connect(src_path)
dst_conn = sqlite3.connect(backup_path)
src_conn.backup(dst_conn)
dst_conn.close()
src_conn.close()

assert backup_path.exists(), f"Backup file was not created at {backup_path}"

# Integrity check on the backup
chk_conn = sqlite3.connect(backup_path)
cur = chk_conn.cursor()
cur.execute("PRAGMA integrity_check;")
res = cur.fetchall()
chk_conn.close()

src_size = os.path.getsize(src_path)
backup_size = os.path.getsize(backup_path)

print(f"BACKUP_SUCCESS: {backup_path.resolve()}")
print(f"Source size: {src_size} bytes, Backup size: {backup_size} bytes")
print(f"Backup integrity check: {res}")

