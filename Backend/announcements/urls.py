from django.urls import path
from .views import list_announcements, create_announcement, manage_announcement

urlpatterns = [
    path('', list_announcements, name='list_announcements'),
    path('create/', create_announcement, name='create_announcement'),
    path('<int:pk>/', manage_announcement, name='manage_announcement'),
]
