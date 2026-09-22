from django.urls import path
from .views import list_announcements, create_announcement

urlpatterns = [
    path('', list_announcements, name='list_announcements'),
    path('create/', create_announcement, name='create_announcement'),
]
