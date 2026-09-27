from django.urls import path
from .views import (
    get_fee_dashboard_stats,
    list_student_fee_records,
    record_fee_payment,
    get_fee_receipt,
    clear_exam_fee_dues,
    bulk_generate_cohort_fees,
    send_fee_reminder,
    my_fees_view,
    list_create_categories,
)

urlpatterns = [
    path('stats/', get_fee_dashboard_stats, name='get_fee_dashboard_stats'),
    path('records/', list_student_fee_records, name='list_student_fee_records'),
    path('pay/', record_fee_payment, name='record_fee_payment'),
    path('receipt/<str:receipt_number>/', get_fee_receipt, name='get_fee_receipt'),
    path('records/<int:record_id>/clear-dues/', clear_exam_fee_dues, name='clear_exam_fee_dues'),
    path('generate/', bulk_generate_cohort_fees, name='bulk_generate_cohort_fees'),
    path('remind/', send_fee_reminder, name='send_fee_reminder'),
    path('my/', my_fees_view, name='my_fees_view'),
    path('categories/', list_create_categories, name='list_create_categories'),
]
