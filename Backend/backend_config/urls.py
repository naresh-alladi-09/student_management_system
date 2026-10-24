"""
URL configuration for backend_config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
import logging
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

logger = logging.getLogger(__name__)

def liveness_check(request):
    """Basic process liveness check for hosting platforms (Render, Railway, Kubernetes)."""
    return JsonResponse({
        "status": "alive",
        "service": "Academic Management System API"
    }, status=200)

def health_check(request):
    """
    Readiness & health check: verifies database connectivity without leaking internal
    infrastructure details, hosts, or exception traces.
    """
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1;")
        return JsonResponse({
            "status": "healthy",
            "service": "Academic Management System API",
            "version": "2.0.0",
            "database": "connected"
        }, status=200)
    except Exception as exc:
        logger.error("Health check database probe failed: %s", exc, exc_info=False)
        return JsonResponse({
            "status": "unhealthy",
            "service": "Academic Management System API",
            "database": "unavailable"
        }, status=503)


urlpatterns = [
    path('', health_check, name='health-check-root'),
    path('api/health/', health_check, name='health-check-api'),
    path('api/health/live/', liveness_check, name='health-check-live'),
    path('api/health/ready/', health_check, name='health-check-ready'),
    path('admin/', admin.site.urls),

    # OpenAPI 3 Schema & Interactive API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # Application APIs
    path('api/auth/', include('accounts.urls')),
    path('api/attendance/', include('attendance.urls')),
    path('api/performance/', include('performance.urls')),
    path('api/timetable/', include('timetable.urls')),
    path('api/announcements/', include('announcements.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/audit/', include('audit.urls')),
    path('api/reports/', include('reports.urls')),
    path('api/', include('students.urls')),
]