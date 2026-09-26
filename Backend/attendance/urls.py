from django.urls import path
from .views import (
    get_daily_attendance,
    bulk_save_attendance,
    student_attendance_detail,
    my_attendance_view,
    attendance_summary,
    create_attendance_session,
    get_active_session,
    refresh_session_token,
    close_attendance_session,
    get_session_attendees,
    mark_qr_attendance,
    list_create_leave_requests,
    review_leave_request,
    delete_leave_request,
)

urlpatterns = [
    path('', get_daily_attendance, name='get_daily_attendance'),
    path('bulk/', bulk_save_attendance, name='bulk_save_attendance'),
    path('summary/', attendance_summary, name='attendance_summary'),
    path('student/<int:student_id>/', student_attendance_detail, name='student_attendance_detail'),
    path('my/', my_attendance_view, name='my_attendance_view'),

    # Student Leave & On-Duty (OD) Endpoints
    path('leaves/', list_create_leave_requests, name='list_create_leave_requests'),
    path('leaves/<int:leave_id>/review/', review_leave_request, name='review_leave_request'),
    path('leaves/<int:leave_id>/', delete_leave_request, name='delete_leave_request'),

    # QR Session Endpoints
    path('sessions/create/', create_attendance_session, name='create_attendance_session'),
    path('sessions/active/', get_active_session, name='get_active_session'),
    path('sessions/<int:session_id>/refresh/', refresh_session_token, name='refresh_session_token'),
    path('sessions/<int:session_id>/close/', close_attendance_session, name='close_attendance_session'),
    path('sessions/<int:session_id>/attendees/', get_session_attendees, name='get_session_attendees'),
    path('mark-qr/', mark_qr_attendance, name='mark_qr_attendance'),
]
