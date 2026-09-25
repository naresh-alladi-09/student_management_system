from django.urls import path
from .views import (
    list_student_scores,
    student_report_card,
    my_report_card,
    save_student_score,
    list_create_subjects,
    performance_summary,
)

urlpatterns = [
    path('', list_student_scores, name='list_student_scores'),
    path('summary/', performance_summary, name='performance_summary'),
    path('student/<int:student_id>/', student_report_card, name='student_report_card'),
    path('my/', my_report_card, name='my_report_card'),
    path('marks/save/', save_student_score, name='save_student_score'),
    path('subjects/', list_create_subjects, name='list_create_subjects'),
]
