import os
import sys
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / '.env')

host = os.environ.get("AIVEN_DB_HOST", "")
port = int(os.environ.get("AIVEN_DB_PORT", 22125))
user = os.environ.get("AIVEN_DB_USER", "avnadmin")
password = os.environ.get("AIVEN_PASSWORD", "")
dbname = os.environ.get("AIVEN_DB_NAME", "defaultdb")
ca_file = BASE_DIR / 'ca.pem'

print("=" * 60)
print("Testing Aiven MySQL Connection")
print("=" * 60)
print(f"Host:     {host}")
print(f"Port:     {port}")
print(f"User:     {user}")
print(f"Database: {dbname}")
print(f"CA File:  {ca_file} (Exists: {ca_file.exists()})")
print("=" * 60)

try:
    import socket
    print(f"1. Testing DNS resolution for {host} ...")
    ip = socket.gethostbyname(host)
    print(f"   [OK] DNS resolved successfully: {ip}")
except Exception as e:
    print(f"   [FAIL] DNS resolution failed: {e}")
    print("\n[NOTE] If this service was powered off, make sure it is 'Running' in console.aiven.io.")
    print("If you have a new service, please update AIVEN_DB_HOST and AIVEN_DB_PORT in Backend/.env.")
    sys.exit(1)

try:
    print(f"2. Testing TCP connection to {host}:{port} ...")
    s = socket.create_connection((host, port), timeout=5)
    s.close()
    print("   [OK] TCP port connection successful.")
except Exception as e:
    print(f"   [FAIL] TCP connection failed: {e}")
    sys.exit(1)

try:
    import MySQLdb
    print("3. Connecting via MySQLdb with SSL ...")
    ssl_dict = {'ca': str(ca_file.resolve())} if ca_file.exists() else None
    conn = MySQLdb.connect(
        host=host,
        port=port,
        user=user,
        passwd=password,
        db=dbname,
        ssl=ssl_dict,
        connect_timeout=5
    )
    cursor = conn.cursor()
    cursor.execute("SELECT VERSION();")
    ver = cursor.fetchone()
    print(f"   [OK] MySQL Connected! Server version: {ver[0]}")
    cursor.execute("SHOW TABLES;")
    tables = cursor.fetchall()
    print(f"   [OK] Tables found: {[t[0] for t in tables]}")
    conn.close()
    print("\n>>> Connection to Aiven MySQL database is 100% SUCCESSFUL! <<<")
except Exception as e:
    print(f"   [FAIL] MySQL login/query failed: {e}")
    sys.exit(1)
