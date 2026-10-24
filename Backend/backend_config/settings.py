"""
Django settings for backend_config project.
Academic Management System — Enterprise Security & Reliability Configuration.
"""
from pathlib import Path
import os
import urllib.parse
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Explicitly load .env from Backend directory if present
load_dotenv(BASE_DIR / '.env')


# =============================================================================
# 1. CORE SECURITY CONFIGURATION (Features 2, 7)
# =============================================================================
# 1. CORE SECURITY CONFIGURATION (Features 2, 7)
# =============================================================================
import sys

# Check if running automated tests
IS_TESTING = 'test' in sys.argv or os.environ.get('TESTING', '').strip().lower() in ('true', '1', 'yes')

# DEBUG defaults to False in production unless explicitly set to True
DEBUG = os.environ.get('DEBUG', 'False').strip().lower() in ('true', '1', 'yes')

# In production (DEBUG=False and not testing), SECRET_KEY must be provided from environment
_INSECURE_DEFAULT_SECRET_KEYS = (
    'ams-prod-django-secret-key-student-management-system-982#$@!5f7a29c1e',
    'local-dev-key-student-management-system-dev-only-not-for-prod',
    'replace-with-a-secure-random-secret-key-in-production',
)
SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG and not IS_TESTING:
        raise ImproperlyConfigured(
            "CRITICAL SECURITY CONFIGURATION ERROR: SECRET_KEY environment variable is missing. "
            "A cryptographically strong secret key must be set in production via SECRET_KEY environment variable."
        )
    # Safe fallback for local development only
    SECRET_KEY = 'ams-dev-only-secret-key-for-local-testing-and-dev-sessions-only'
elif not DEBUG and not IS_TESTING and SECRET_KEY in _INSECURE_DEFAULT_SECRET_KEYS:
    raise ImproperlyConfigured(
        "CRITICAL SECURITY CONFIGURATION ERROR: An insecure or well-known default SECRET_KEY was detected in production. "
        "Generate a fresh unique secret key with: python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'"
    )

# ALLOWED_HOSTS: require explicit hostnames; never allow wildcard '*' in production
allowed_hosts_env = os.environ.get('ALLOWED_HOSTS')
if allowed_hosts_env and allowed_hosts_env.strip():
    ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_env.split(',') if h.strip() and h.strip() != '*']
else:
    ALLOWED_HOSTS = [
        'localhost',
        '127.0.0.1',
        '[::1]',
        'testserver',
        '.onrender.com',
    ]

render_hostname = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if render_hostname and render_hostname not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(render_hostname)

if 'testserver' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('testserver')


# =============================================================================
# 2. APPLICATION DEFINITION & MIDDLEWARE
# =============================================================================

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'students',
    'accounts',
    'attendance',
    'performance',
    'timetable',
    'announcements',
    'notifications',
    'audit',
    'reports',
    'drf_spectacular',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend_config.urls'

WSGI_APPLICATION = 'backend_config.wsgi.application'


# =============================================================================
# 3. REST FRAMEWORK & THROTTLING CONFIGURATION (Features 6, 8)
# =============================================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('THROTTLE_ANON_RATE', '60/min'),
        'user': os.environ.get('THROTTLE_USER_RATE', '300/min'),
    },
    'EXCEPTION_HANDLER': 'backend_config.exceptions.custom_exception_handler',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 15,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Academic Management System API',
    'DESCRIPTION': 'Enterprise Student, Attendance, Performance, and Timetable Management API with 3-tier Role-Based Access Control.',
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]


# =============================================================================
# 4. DATABASE CONFIGURATION (Feature 2)
# =============================================================================

# Test runner isolation: When running automated tests, use isolated in-memory SQLite database
if IS_TESTING:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
else:
    database_url = os.environ.get("DATABASE_URL") or os.environ.get("AIVEN_SERVICE_URI")
    use_local_sqlite = os.environ.get("USE_SQLITE", "false").lower() == "true"

    if use_local_sqlite:
        DATABASES = {
            'default': {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': BASE_DIR / 'db.sqlite3',
            }
        }
    elif database_url:
        parsed_url = urllib.parse.urlparse(database_url)
        db_engine = "django.db.backends.mysql"
        db_name = parsed_url.path.lstrip('/') or "defaultdb"
        db_user = parsed_url.username or "avnadmin"
        db_password = parsed_url.password or ""
        db_host = parsed_url.hostname or "127.0.0.1"
        db_port = parsed_url.port or 3306

        db_options = {'charset': 'utf8mb4'}
        ca_path = BASE_DIR / 'ca.pem'
        ca_cert_data = os.environ.get("AIVEN_CA_CERT") or os.environ.get("DB_SSL_CA")
        if ca_cert_data and not ca_path.exists():
            try:
                ca_path.write_text(ca_cert_data, encoding='utf-8')
            except Exception:
                pass
        if ca_path.exists():
            db_options['ssl'] = {'ca': str(ca_path.resolve())}

        DATABASES = {
            'default': {
                "ENGINE": db_engine,
                "NAME": db_name,
                "USER": db_user,
                "PASSWORD": db_password,
                "HOST": db_host,
                "PORT": db_port,
                'OPTIONS': db_options,
            }
        }
    else:
        db_engine = os.environ.get("DB_ENGINE", "django.db.backends.mysql")
        db_name = os.environ.get("AIVEN_DB_NAME", os.environ.get("DB_NAME", "defaultdb"))
        db_user = os.environ.get("AIVEN_DB_USER", os.environ.get("DB_USER", "avnadmin"))
        db_password = os.environ.get("AIVEN_PASSWORD", os.environ.get("DB_PASSWORD", ""))
        db_host = os.environ.get("AIVEN_DB_HOST", os.environ.get("DB_HOST", ""))
        db_port_raw = os.environ.get("AIVEN_DB_PORT", os.environ.get("DB_PORT", "22125"))
        try:
            db_port = int(db_port_raw)
        except (ValueError, TypeError):
            db_port = 3306

        if db_engine == "django.db.backends.sqlite3":
            DATABASES = {
                'default': {
                    'ENGINE': 'django.db.backends.sqlite3',
                    'NAME': BASE_DIR / 'db.sqlite3',
                }
            }
        else:
            # Validate remote database configuration at startup
            if not db_host:
                if not DEBUG:
                    raise ImproperlyConfigured(
                        "CRITICAL DATABASE CONFIGURATION ERROR: Remote database host is missing in production. "
                        "Configure DATABASE_URL or AIVEN_DB_HOST/DB_HOST environment variable."
                    )
                else:
                    print("[NOTICE] Remote DB_HOST is not set; using local SQLite database for development.")
                    DATABASES = {
                        'default': {
                            'ENGINE': 'django.db.backends.sqlite3',
                            'NAME': BASE_DIR / 'db.sqlite3',
                        }
                    }
            elif not db_password and not DEBUG and db_host not in ("127.0.0.1", "localhost"):
                raise ImproperlyConfigured(
                    f"CRITICAL DATABASE CONFIGURATION ERROR: Database password is missing for host '{db_host}' in production. "
                    "Configure AIVEN_PASSWORD or DB_PASSWORD environment variable."
                )
            else:
                db_options = {'charset': 'utf8mb4'}
                ca_path = BASE_DIR / 'ca.pem'
                ca_cert_data = os.environ.get("AIVEN_CA_CERT") or os.environ.get("DB_SSL_CA")
                if ca_cert_data and not ca_path.exists():
                    try:
                        ca_path.write_text(ca_cert_data, encoding='utf-8')
                    except Exception:
                        pass
                if ca_path.exists():
                    db_options['ssl'] = {'ca': str(ca_path.resolve())}

                DATABASES = {
                    'default': {
                        "ENGINE": db_engine,
                        "NAME": db_name,
                        "USER": db_user,
                        "PASSWORD": db_password,
                        "HOST": db_host,
                        "PORT": db_port,
                        'OPTIONS': db_options,
                    }
                }


# =============================================================================
# 5. PASSWORD VALIDATION & POLICIES (Feature 1)
# =============================================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {
            'min_length': 8,
        }
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# =============================================================================
# 6. INTERNATIONALIZATION & STATIC FILES
# =============================================================================

LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.environ.get('DJANGO_TIME_ZONE', 'Asia/Kolkata')
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATIC_ROOT.mkdir(exist_ok=True)



# =============================================================================
# 7. CORS & CSRF CONFIGURATION (Features 2, 7)
# =============================================================================
from corsheaders.defaults import default_headers, default_methods

# Strict CORS in production: allow all origins only if explicitly opted-in via env var
cors_allow_all_env = os.environ.get('CORS_ALLOW_ALL_ORIGINS')
if cors_allow_all_env is not None:
    CORS_ALLOW_ALL_ORIGINS = cors_allow_all_env.strip().lower() in ('true', '1', 'yes')
else:
    CORS_ALLOW_ALL_ORIGINS = bool(DEBUG)

# Standard development and frontend preview origins that are always allowed
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

render_external_host = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if render_external_host:
    _DEFAULT_CORS_ORIGINS.append(f"https://{render_external_host}")

cors_origins_env = os.environ.get('CORS_ALLOWED_ORIGINS')
if cors_origins_env and cors_origins_env.strip():
    custom_origins = [o.strip() for o in cors_origins_env.split(',') if o.strip()]
    CORS_ALLOWED_ORIGINS = list(dict.fromkeys(_DEFAULT_CORS_ORIGINS + custom_origins))
else:
    CORS_ALLOWED_ORIGINS = _DEFAULT_CORS_ORIGINS

# Common frontend cloud hosting domains (Vercel, Render, Netlify, Cloudflare Pages, GitHub Pages)
_DEFAULT_CORS_REGEXES = [
    r"^https:\/\/.*\.vercel\.app$",
    r"^https:\/\/.*\.onrender\.com$",
    r"^https:\/\/.*\.netlify\.app$",
    r"^https:\/\/.*\.pages\.dev$",
    r"^https:\/\/.*\.github\.io$",
]

cors_regex_env = os.environ.get('CORS_ALLOWED_ORIGIN_REGEXES')
if cors_regex_env and cors_regex_env.strip():
    custom_regexes = [r.strip() for r in cors_regex_env.split(',') if r.strip()]
    CORS_ALLOWED_ORIGIN_REGEXES = list(dict.fromkeys(_DEFAULT_CORS_REGEXES + custom_regexes))
else:
    CORS_ALLOWED_ORIGIN_REGEXES = _DEFAULT_CORS_REGEXES

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = list(dict.fromkeys(list(default_headers) + [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]))

CORS_ALLOW_METHODS = list(dict.fromkeys(list(default_methods) + [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]))

CORS_PREFLIGHT_MAX_AGE = 86400

# CSRF Trusted Origins
_DEFAULT_CSRF_TRUSTED = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "https://*.vercel.app",
    "https://*.onrender.com",
    "https://*.netlify.app",
    "https://*.pages.dev",
    "https://*.github.io",
]
if render_external_host:
    _DEFAULT_CSRF_TRUSTED.append(f"https://{render_external_host}")

csrf_origins_env = os.environ.get('CSRF_TRUSTED_ORIGINS')
if csrf_origins_env and csrf_origins_env.strip():
    custom_csrf = [o.strip() for o in csrf_origins_env.split(',') if o.strip()]
    CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(_DEFAULT_CSRF_TRUSTED + custom_csrf))
else:
    CSRF_TRUSTED_ORIGINS = _DEFAULT_CSRF_TRUSTED


# =============================================================================
# 8. HTTPS, COOKIES & SECURITY HEADERS (Features 2, 7)
# =============================================================================

if not DEBUG:
    # Reverse proxy protocol header (e.g. Render, Railway, AWS ALB, Nginx)
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True').strip().lower() in ('true', '1', 'yes')

    # Strict-Transport-Security (HSTS)
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', 31536000))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    # Secure Cookies
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = False
    CSRF_COOKIE_SAMESITE = 'Lax'

    # Content Security & Frame Protection
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
else:
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    CSRF_COOKIE_HTTPONLY = False
    X_FRAME_OPTIONS = 'SAMEORIGIN'


# =============================================================================
# 9. STRUCTURED LOGGING & AUDIT CONFIGURATION (Feature 6)
# =============================================================================

LOGS_DIR = BASE_DIR / 'logs'
has_file_logging = False
try:
    LOGS_DIR.mkdir(exist_ok=True)
    test_file = LOGS_DIR / '.write_test'
    test_file.touch()
    test_file.unlink()
    has_file_logging = True
except Exception:
    has_file_logging = False

active_app_handlers = ['console', 'app_file'] if has_file_logging else ['console']
active_sec_handlers = ['console', 'security_file'] if has_file_logging else ['console']

handlers_config = {
    'console': {
        'class': 'logging.StreamHandler',
        'formatter': 'standard',
    },
}

if has_file_logging:
    handlers_config['app_file'] = {
        'class': 'logging.handlers.RotatingFileHandler',
        'filename': str(LOGS_DIR / 'django.log'),
        'maxBytes': 10 * 1024 * 1024,  # 10 MB
        'backupCount': 5,
        'formatter': 'standard',
        'encoding': 'utf-8',
    }
    handlers_config['security_file'] = {
        'class': 'logging.handlers.RotatingFileHandler',
        'filename': str(LOGS_DIR / 'security.log'),
        'maxBytes': 10 * 1024 * 1024,  # 10 MB
        'backupCount': 5,
        'formatter': 'security',
        'encoding': 'utf-8',
    }

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '[{asctime}] {levelname} [{name}:{lineno}] {message}',
            'style': '{',
        },
        'security': {
            'format': '[{asctime}] SECURITY {levelname} {message}',
            'style': '{',
        },
    },
    'handlers': handlers_config,
    'loggers': {
        'django': {
            'handlers': active_app_handlers,
            'level': os.environ.get('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'django.security': {
            'handlers': active_sec_handlers,
            'level': 'WARNING',
            'propagate': False,
        },
        'security': {
            'handlers': active_sec_handlers,
            'level': 'INFO',
            'propagate': False,
        },
        'accounts': {
            'handlers': active_app_handlers,
            'level': 'INFO',
            'propagate': False,
        },
        'attendance': {
            'handlers': active_app_handlers,
            'level': 'INFO',
            'propagate': False,
        },
        'students': {
            'handlers': active_app_handlers,
            'level': 'INFO',
            'propagate': False,
        },
    },
}


# =============================================================================
# 10. EMAIL SERVICE & FILE UPLOADS
# =============================================================================

EMAIL_BACKEND = os.environ.get(
    'DJANGO_EMAIL_BACKEND',
    'django.core.mail.backends.smtp.EmailBackend' if os.environ.get('EMAIL_HOST_USER') else 'django.core.mail.backends.console.EmailBackend'
)
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 'yes')
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '').strip()
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '').strip().replace(' ', '')
DEFAULT_FROM_EMAIL = os.environ.get(
    'DEFAULT_FROM_EMAIL',
    f"Academic Affairs <{EMAIL_HOST_USER}>" if EMAIL_HOST_USER else 'Academic Affairs <noreply@eduportal.edu>'
)

DATA_UPLOAD_MAX_MEMORY_SIZE = 26214400  # 25 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 26214400  # 25 MB