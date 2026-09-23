from django.urls import path
from .views import (
    list_timetable,
    get_today_timetable,
    create_timetable_slot,
    start_attendance_from_slot,
    manage_timetable_slot,
)

urlpatterns = [
    path('', list_timetable, name='list_timetable'),
    path('today/', get_today_timetable, name='today_timetable'),
    path('create/', create_timetable_slot, name='create_timetable_slot'),
    path('<int:slot_id>/start-attendance/', start_attendance_from_slot, name='start_attendance_from_slot'),
    path('<int:slot_id>/', manage_timetable_slot, name='manage_timetable_slot'),
]
