from django.urls import path
from .views import list_audit_logs

urlpatterns = [
    path('logs/', list_audit_logs, name='list_audit_logs'),
]
