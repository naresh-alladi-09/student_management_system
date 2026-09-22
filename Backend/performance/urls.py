from django.urls import path
from .views import list_student_scores, student_report_card, list_subjects

urlpatterns = [
    path('', list_student_scores, name='list_student_scores'),
    path('student/<int:student_id>/', student_report_card, name='student_report_card'),
    path('subjects/', list_subjects, name='list_subjects'),
]
