from django.urls import path
from .views import (
    get_daily_attendance,
    bulk_save_attendance,
    student_attendance_detail,
    attendance_summary,
)

urlpatterns = [
    path('', get_daily_attendance, name='get_daily_attendance'),
    path('bulk/', bulk_save_attendance, name='bulk_save_attendance'),
    path('student/<int:student_id>/', student_attendance_detail, name='student_attendance_detail'),
    path('summary/', attendance_summary, name='attendance_summary'),
]
