import logging
from django.conf import settings
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger('django.request')
security_logger = logging.getLogger('security')


def custom_exception_handler(exc, context):
    """
    Custom exception handler that prevents exposing Django tracebacks or
    internal database implementation details to clients in production.
    Logs rich context for server-side diagnosis.
    """
    # Call REST framework's default exception handler first to get the standard error response.
    response = exception_handler(exc, context)

    request = context.get('request')
    view = context.get('view')
    view_name = view.__class__.__name__ if view else 'UnknownView'
    user = getattr(request, 'user', None) if request else None
    path = getattr(request, 'path', '') if request else ''
    method = getattr(request, 'method', '') if request else ''

    if response is not None:
        # Standard DRF exception (e.g. 400 ValidationError, 401 NotAuthenticated, 403 PermissionDenied, 404 NotFound, 429 Throttled)
        if response.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN]:
            security_logger.warning(
                f"Security/Authorization rejection: Status {response.status_code} on {method} {path} by user '{user}'. Reason: {response.data}"
            )
        return response

    # Unhandled server exception (500 Internal Server Error)
    logger.error(
        f"Unhandled server error in {view_name} [{method} {path}] for user '{user}': {exc}",
        exc_info=True,
        extra={'request': request}
    )

    if settings.DEBUG:
        # In development, let developer see details
        return Response(
            {
                "detail": f"Internal Server Error: {str(exc)}",
                "type": exc.__class__.__name__,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # In production, never leak tracebacks or database errors
    return Response(
        {
            "detail": "An internal server error occurred. Our technical staff has been notified.",
            "code": "internal_error",
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
