import os
import sys
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from audit.models import AuditLog


class Command(BaseCommand):
    help = "Generates a secure database backup snapshot (SQLite or MySQL) without exposing credentials."

    def add_arguments(self, parser):
        parser.add_argument(
            '--output-dir',
            type=str,
            default=None,
            help='Directory path where backup file should be saved (defaults to Backend/backups/).',
        )
        parser.add_argument(
            '--compress',
            action='store_true',
            help='Compress the backup file using gzip.',
        )

    def handle(self, *args, **options):
        db_conf = settings.DATABASES['default']
        engine = db_conf.get('ENGINE', '')
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

        # Determine target directory
        if options['output_dir']:
            backup_dir = Path(options['output_dir']).resolve()
        else:
            backup_dir = settings.BASE_DIR / 'backups'

        backup_dir.mkdir(parents=True, exist_ok=True)

        # Ensure backup directory is strictly NOT within frontend public or static files
        forbidden_paths = [
            str((settings.BASE_DIR.parent / 'public').resolve()),
            str((settings.BASE_DIR.parent / 'src').resolve()),
            str(settings.STATIC_ROOT.resolve()) if hasattr(settings, 'STATIC_ROOT') and settings.STATIC_ROOT else '',
        ]
        resolved_backup_dir = str(backup_dir.resolve())
        for fp in forbidden_paths:
            if fp and resolved_backup_dir.startswith(fp):
                raise CommandError(f"Security Violation: Backup directory cannot be inside public or static assets ({fp}).")

        self.stdout.write(f"Initiating secure database backup for engine: {engine}...")

        if 'sqlite' in engine:
            import sqlite3
            src_db_file = Path(db_conf['NAME']).resolve()
            if not src_db_file.exists():
                raise CommandError(f"SQLite database file not found at: {src_db_file}")

            target_filename = f"backup_sqlite_{timestamp}.sqlite3"
            target_path = backup_dir / target_filename

            # Perform consistent online SQLite backup using Python's sqlite3 API
            source_conn = sqlite3.connect(str(src_db_file))
            target_conn = sqlite3.connect(str(target_path))
            with target_conn:
                source_conn.backup(target_conn)
            target_conn.close()
            source_conn.close()

            file_size_kb = target_path.stat().st_size / 1024
            self.stdout.write(self.style.SUCCESS(
                f"SQLite backup successfully created: {target_path} ({file_size_kb:.2f} KB)"
            ))

        elif 'mysql' in engine:
            db_name = db_conf.get('NAME')
            db_user = db_conf.get('USER')
            db_password = db_conf.get('PASSWORD')
            db_host = db_conf.get('HOST', '127.0.0.1')
            db_port = str(db_conf.get('PORT', 3306))

            target_filename = f"backup_mysql_{db_name}_{timestamp}.sql"
            target_path = backup_dir / target_filename

            # Attempt mysqldump command
            mysqldump_cmd = shutil.which('mysqldump')
            if mysqldump_cmd:
                env = os.environ.copy()
                if db_password:
                    env['MYSQL_PWD'] = db_password

                cmd = [
                    mysqldump_cmd,
                    f"-h{db_host}",
                    f"-P{db_port}",
                    f"-u{db_user}",
                    "--single-transaction",
                    "--quick",
                    "--routines",
                    "--triggers",
                    db_name,
                ]

                try:
                    with open(target_path, 'w', encoding='utf-8') as out_f:
                        res = subprocess.run(cmd, stdout=out_f, stderr=subprocess.PIPE, env=env, text=True)
                        if res.returncode != 0:
                            raise CommandError(f"mysqldump failed with error: {res.stderr}")

                    file_size_kb = target_path.stat().st_size / 1024
                    self.stdout.write(self.style.SUCCESS(
                        f"MySQL backup successfully created: {target_path} ({file_size_kb:.2f} KB)"
                    ))
                except Exception as e:
                    if target_path.exists():
                        target_path.unlink()
                    raise CommandError(f"Failed to execute mysqldump: {e}")
            else:
                # If mysqldump executable is not installed on host machine, provide fallback Django dumpdata
                target_filename = f"backup_data_{timestamp}.json"
                target_path = backup_dir / target_filename
                self.stdout.write(self.style.WARNING("mysqldump utility not in PATH. Using Django dumpdata as fallback..."))

                from django.core.management import call_command
                with open(target_path, 'w', encoding='utf-8') as out_f:
                    call_command(
                        'dumpdata',
                        exclude=['contenttypes', 'auth.permission'],
                        indent=2,
                        stdout=out_f
                    )
                file_size_kb = target_path.stat().st_size / 1024
                self.stdout.write(self.style.SUCCESS(
                    f"Django database snapshot successfully created: {target_path} ({file_size_kb:.2f} KB)"
                ))

        else:
            raise CommandError(f"Unsupported database engine for backup: {engine}")

        # Optional GZIP compression
        if options['compress'] and target_path.exists():
            import gzip
            gz_path = Path(f"{target_path}.gz")
            with open(target_path, 'rb') as f_in, gzip.open(gz_path, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
            target_path.unlink()
            target_path = gz_path
            file_size_kb = target_path.stat().st_size / 1024
            self.stdout.write(self.style.SUCCESS(
                f"Compressed backup saved: {target_path} ({file_size_kb:.2f} KB)"
            ))

        AuditLog.log(
            action='REPORT_GENERATE',
            entity='DatabaseBackup',
            entity_id=target_filename,
            description=f"Generated database backup snapshot: {target_filename} ({file_size_kb:.2f} KB)."
        )
