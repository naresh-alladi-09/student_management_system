from django.urls import path
from .views import list_timetable, create_timetable_slot

urlpatterns = [
    path('', list_timetable, name='list_timetable'),
    path('create/', create_timetable_slot, name='create_timetable_slot'),
]
