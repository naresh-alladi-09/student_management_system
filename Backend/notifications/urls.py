from django.urls import path
from .views import my_notifications, mark_notification_read

urlpatterns = [
    path('', my_notifications, name='my_notifications'),
    path('read/', mark_notification_read, name='mark_all_notifications_read'),
    path('<int:notification_id>/read/', mark_notification_read, name='mark_notification_read'),
]
