# Database Backup and Disaster Recovery Strategy

This document specifies the institutional database backup and disaster recovery procedures for the Academic Management System.

---

## 1. Backup Scope & Policy

- **Target Data**: Student profiles, user accounts, attendance records, course performance/grades, timetables, and audit logs.
- **Security Constraint**: Backups must NEVER be placed in public-facing, static, or frontend directories (`/public`, `/src`, `/staticfiles`).
- **Secret Protection**: Backups never expose connection strings, database passwords, or unhashed credentials.
- **Recommended Production Frequency**:
  - **Full Snapshot**: Daily at 02:00 UTC (automated cron/scheduled task during minimal traffic).
  - **Incremental / Transaction Logs**: Every 6 hours (or continuous WAL/binlog enabled by cloud managed database).
  - **Retention Period**:
    - Daily backups: Retained for 30 days.
    - Weekly archives: Retained for 12 weeks.
    - Monthly semester archives: Retained for 5 academic years.

---

## 2. Performing a Backup

### Method A: Integrated Management Command (Recommended)

Run the secure backup command from the backend project root:

```bash
# Standard backup to Backend/backups/
python manage.py backup_database

# Backup with GZIP compression
python manage.py backup_database --compress

# Backup to custom secure external directory
python manage.py backup_database --output-dir=/var/backups/academic_system/
```

- When MySQL client tools (`mysqldump`) are available on the server, a single-transaction SQL dump is generated.
- When `mysqldump` is unavailable, a complete Django serialized dump snapshot is produced safely.

### Method B: Native MySQL Tooling (`mysqldump`)

For production MySQL / MariaDB databases:

```bash
mysqldump -h $AIVEN_DB_HOST -P $AIVEN_DB_PORT -u $AIVEN_DB_USER -p$AIVEN_PASSWORD \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  $AIVEN_DB_NAME > /secure_storage/academic_db_$(date +%Y%m%d_%H%M%S).sql
```

### Method C: Cloud-Managed Redundancy (Aiven / AWS RDS)

If using a managed service provider (e.g., Aiven MySQL, AWS RDS, DigitalOcean):
- Automated point-in-time recovery (PITR) is managed at the database cluster level.
- Multi-AZ read replicas provide immediate failover without manual restore intervention.
- Enable automated daily cloud snapshots in the provider management console with at least 14 days retention.

---

## 3. Database Restoration Procedure

### Step 1: Pre-Restoration Verification & Isolation
1. Temporarily enable maintenance mode or suspend ingress traffic to prevent data drift during restore.
2. Verify the integrity and timestamp of the chosen backup snapshot.
3. Test restoration in a staging or development environment prior to applying to production.

### Step 2: Restoring from SQL Dump
For MySQL / MariaDB databases:

```bash
# Decompress if archived
gunzip -k /secure_storage/backup_mysql_defaultdb_20261001_120000.sql.gz

# Execute restore against target database
mysql -h $AIVEN_DB_HOST -P $AIVEN_DB_PORT -u $AIVEN_DB_USER -p$AIVEN_PASSWORD $AIVEN_DB_NAME < /secure_storage/backup_mysql_defaultdb_20261001_120000.sql
```

### Step 3: Restoring from Django Snapshot (JSON)
If restoring from a Django management snapshot:

```bash
python manage.py migrate
python manage.py loaddata /secure_storage/backup_data_20261001_174409.json
```

### Step 4: Post-Restoration Verification
1. Run database consistency checks:
   ```bash
   python manage.py check
   ```
2. Verify total student count, attendance records, and faculty assignments.
3. Resume application service and verify authentication and role access.

---

## 4. Disaster Recovery Checklist

| Check | Action Item | Expected Result |
| :--- | :--- | :--- |
| 1 | File Integrity | MD5 or SHA256 checksum matches before restoring |
| 2 | Isolation | Production incoming requests paused during restore |
| 3 | Schema Synchronization | Migrations applied cleanly (`python manage.py migrate`) |
| 4 | RBAC Check | Administrator, faculty, and student roles authenticate properly |
| 5 | Audit Trail | Log restoration event in system maintenance log |
