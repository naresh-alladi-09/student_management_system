import re
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError


def get_client_ip(request):
    """
    Safely extract client IP from request, taking proxy headers into account when present.
    """
    if not request:
        return '127.0.0.1'
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR', '127.0.0.1')
    return ip or '127.0.0.1'


def get_user_agent(request):
    """
    Extract User-Agent string from request.
    """
    if not request:
        return ''
    return request.META.get('HTTP_USER_AGENT', '')[:500]


def validate_strong_password(password, user=None):
    """
    Validate password against Django's password validators and enforce:
    - Minimum length of 8 characters
    - At least one digit or special character
    Returns a list of error strings (empty if valid).
    """
    errors = []
    if not password or len(password) < 8:
        errors.append("Password must be at least 8 characters long.")

    if not re.search(r'\d', password or ''):
        errors.append("Password must contain at least one numerical digit.")

    try:
        validate_password(password, user=user)
    except ValidationError as e:
        for msg in e.messages:
            if msg not in errors:
                errors.append(msg)

    return errors
