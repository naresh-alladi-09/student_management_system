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

# DEBUG defaults to False in production unless explicitly set to True
DEBUG = os.environ.get('DEBUG', 'False').strip().lower() in ('true', '1', 'yes')

SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        # Development fallback secret key
        SECRET_KEY = 'dev-insecure-local-only-key-student-management-system-982#$@!'
    else:
        raise ImproperlyConfigured(
            "CRITICAL SECURITY CONFIGURATION ERROR: SECRET_KEY environment variable is missing. "
            "In production (DEBUG=False), a cryptographically secure SECRET_KEY must be provided via environment variables."
        )
elif not DEBUG and ('insecure' in SECRET_KEY.lower() or len(SECRET_KEY) < 32):
    raise ImproperlyConfigured(
        "CRITICAL SECURITY CONFIGURATION ERROR: An insecure or insufficiently long SECRET_KEY was provided in production. "
        "Provide a secure random key with at least 32 characters."
    )

# Strict ALLOWED_HOSTS separation
allowed_hosts_env = os.environ.get('ALLOWED_HOSTS')
if allowed_hosts_env:
    ALLOWED_HOSTS = [h.strip() for h in allowed_hosts_env.split(',') if h.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']
else:
    raise ImproperlyConfigured(
        "CRITICAL SECURITY CONFIGURATION ERROR: ALLOWED_HOSTS environment variable must be configured when DEBUG=False."
    )


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

database_url = os.environ.get("DATABASE_URL") or os.environ.get("AIVEN_SERVICE_URI")

if database_url:
    parsed_url = urllib.parse.urlparse(database_url)
    db_engine = "django.db.backends.mysql"
    db_name = parsed_url.path.lstrip('/') or "defaultdb"
    db_user = parsed_url.username or "avnadmin"
    db_password = parsed_url.password or ""
    db_host = parsed_url.hostname or "127.0.0.1"
    db_port = parsed_url.port or 3306
else:
    db_engine = os.environ.get("DB_ENGINE", "django.db.backends.mysql")
    db_name = os.environ.get("AIVEN_DB_NAME", os.environ.get("DB_NAME", "defaultdb"))
    db_user = os.environ.get("AIVEN_DB_USER", os.environ.get("DB_USER", "avnadmin"))
    db_password = os.environ.get("AIVEN_PASSWORD", os.environ.get("DB_PASSWORD", ""))
    db_host = os.environ.get("AIVEN_DB_HOST", os.environ.get("DB_HOST", "127.0.0.1"))
    db_port = int(os.environ.get("AIVEN_DB_PORT", os.environ.get("DB_PORT", 3306)))

db_options = {
    'charset': 'utf8mb4',
}

ca_path = BASE_DIR / 'ca.pem'
if ca_path.exists():
    db_options['ssl'] = {
        'ca': str(ca_path.resolve()),
    }

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


# =============================================================================
# 7. CORS & CSRF CONFIGURATION (Features 2, 7)
# =============================================================================

# Strict CORS: Never allow all origins in production
if DEBUG:
    cors_allow_all = os.environ.get('CORS_ALLOW_ALL_ORIGINS', 'False').strip().lower()
    CORS_ALLOW_ALL_ORIGINS = cors_allow_all in ('true', '1', 'yes')
else:
    CORS_ALLOW_ALL_ORIGINS = False

cors_origins_env = os.environ.get('CORS_ALLOWED_ORIGINS')
if cors_origins_env:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in cors_origins_env.split(',') if o.strip()]
elif DEBUG:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
    ]
else:
    CORS_ALLOWED_ORIGINS = []

CORS_ALLOW_CREDENTIALS = True

# CSRF Trusted Origins
csrf_origins_env = os.environ.get('CSRF_TRUSTED_ORIGINS')
if csrf_origins_env:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in csrf_origins_env.split(',') if o.strip()]
elif DEBUG:
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:8000",
    ]
else:
    CSRF_TRUSTED_ORIGINS = []


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
    CSRF_COOKIE_HTTPONLY = True
    CSRF_COOKIE_SAMESITE = 'Lax'

    # Content Security & Frame Protection
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = 'DENY'
else:
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    X_FRAME_OPTIONS = 'SAMEORIGIN'


# =============================================================================
# 9. STRUCTURED LOGGING & AUDIT CONFIGURATION (Feature 6)
# =============================================================================

LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

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
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'standard',
        },
        'app_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(LOGS_DIR / 'django.log'),
            'maxBytes': 10 * 1024 * 1024,  # 10 MB
            'backupCount': 5,
            'formatter': 'standard',
            'encoding': 'utf-8',
        },
        'security_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(LOGS_DIR / 'security.log'),
            'maxBytes': 10 * 1024 * 1024,  # 10 MB
            'backupCount': 5,
            'formatter': 'security',
            'encoding': 'utf-8',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'app_file'],
            'level': os.environ.get('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'django.security': {
            'handlers': ['console', 'security_file'],
            'level': 'WARNING',
            'propagate': False,
        },
        'security': {
            'handlers': ['console', 'security_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'accounts': {
            'handlers': ['console', 'app_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'attendance': {
            'handlers': ['console', 'app_file'],
            'level': 'INFO',
            'propagate': False,
        },
        'students': {
            'handlers': ['console', 'app_file'],
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
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Academic Affairs <noreply@eduportal.edu>')

DATA_UPLOAD_MAX_MEMORY_SIZE = 26214400  # 25 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 26214400  # 25 MB