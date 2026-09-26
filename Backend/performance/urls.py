from django.urls import path
from .views import (
    list_student_scores,
    student_report_card,
    my_report_card,
    save_student_score,
    list_create_subjects,
    delete_subject_view,
    performance_summary,
    list_create_exam_sessions,
    exam_session_detail,
    generate_hall_tickets,
    approve_and_release_hall_tickets,
    list_exam_hall_tickets,
    condone_hall_ticket,
    my_hall_tickets,
    verify_hall_ticket,
)

urlpatterns = [
    path('', list_student_scores, name='list_student_scores'),
    path('summary/', performance_summary, name='performance_summary'),
    path('student/<int:student_id>/', student_report_card, name='student_report_card'),
    path('my/', my_report_card, name='my_report_card'),
    path('marks/save/', save_student_score, name='save_student_score'),
    path('subjects/', list_create_subjects, name='list_create_subjects'),
    path('subjects/<int:subject_id>/', delete_subject_view, name='delete_subject_view'),

    # Exam Sessions & Hall Tickets
    path('exams/', list_create_exam_sessions, name='list_create_exam_sessions'),
    path('exams/<int:exam_id>/', exam_session_detail, name='exam_session_detail'),
    path('exams/<int:exam_id>/generate-tickets/', generate_hall_tickets, name='generate_hall_tickets'),
    path('exams/<int:exam_id>/release/', approve_and_release_hall_tickets, name='approve_and_release_hall_tickets'),
    path('exams/<int:exam_id>/tickets/', list_exam_hall_tickets, name='list_exam_hall_tickets'),
    path('tickets/<int:ticket_id>/condone/', condone_hall_ticket, name='condone_hall_ticket'),
    path('my-halltickets/', my_hall_tickets, name='my_hall_tickets'),
    path('hallticket/verify/<str:token>/', verify_hall_ticket, name='verify_hall_ticket'),
]

