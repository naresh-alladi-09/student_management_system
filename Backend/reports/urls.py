from django.urls import path
from .views import (
    attendance_report,
    low_attendance_report,
    student_roster_report,
    performance_report,
)

urlpatterns = [
    path('attendance/', attendance_report, name='attendance_report'),
    path('low-attendance/', low_attendance_report, name='low_attendance_report'),
    path('students/', student_roster_report, name='student_roster_report'),
    path('performance/', performance_report, name='performance_report'),
]
