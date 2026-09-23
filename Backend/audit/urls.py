from django.urls import path
from .views import list_audit_logs, get_audit_stats

urlpatterns = [
    path('logs/', list_audit_logs, name='list_audit_logs'),
    path('stats/', get_audit_stats, name='get_audit_stats'),
]
