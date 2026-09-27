import logging
from decimal import Decimal
from datetime import datetime
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsTeacherOrAdmin
from students.models import Student
from notifications.models import Notification
from audit.models import AuditLog
from .models import FeeCategory, FeeStructure, StudentFeeRecord, FeePayment
from .serializers import (
    FeeCategorySerializer,
    FeeStructureSerializer,
    StudentFeeRecordSerializer,
    FeePaymentSerializer,
)

logger = logging.getLogger(__name__)


# =====================================================================
# 1. BURSAR & ADMIN EXECUTIVE DASHBOARD ANALYTICS
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def get_fee_dashboard_stats(request):
    """
    Returns high-level institutional fee financial summary:
    Total expected revenue, collected revenue, outstanding dues, and cohort breakdowns.
    """
    records = StudentFeeRecord.objects.select_related('student', 'fee_category').all()

    total_billed = sum([r.net_amount for r in records]) or Decimal('0.00')
    total_collected = sum([r.paid_amount for r in records]) or Decimal('0.00')
    total_outstanding = sum([r.balance_due for r in records]) or Decimal('0.00')

    collection_rate = round(float((total_collected / total_billed * 100)), 1) if total_billed > 0 else 0.0

    # Defaulter students with balance due > 0
    students_with_dues = set()
    for r in records:
        if r.balance_due > Decimal('0.00'):
            students_with_dues.add(r.student_id)

    total_defaulters_count = len(students_with_dues)

    # Category-wise breakdown
    category_summary = []
    categories = FeeCategory.objects.all()
    for cat in categories:
        cat_records = records.filter(fee_category=cat)
        cat_billed = sum([r.net_amount for r in cat_records]) or Decimal('0.00')
        cat_collected = sum([r.paid_amount for r in cat_records]) or Decimal('0.00')
        cat_due = sum([r.balance_due for r in cat_records]) or Decimal('0.00')
        category_summary.append({
            "category_id": cat.id,
            "name": cat.name,
            "code": cat.code,
            "is_mandatory_for_exam": cat.is_mandatory_for_exam,
            "billed": float(cat_billed),
            "collected": float(cat_collected),
            "due": float(cat_due),
            "collection_rate": round(float((cat_collected / cat_billed * 100)), 1) if cat_billed > 0 else 0.0,
        })

    # Status distribution
    status_counts = {
        'PAID': records.filter(status='PAID').count(),
        'PARTIAL': records.filter(status='PARTIAL').count(),
        'PENDING': records.filter(status='PENDING').count(),
        'OVERDUE': records.filter(status='OVERDUE').count(),
    }

    # Recent 10 payments
    recent_payments = FeePayment.objects.select_related('student', 'fee_record', 'collected_by').order_by('-payment_date')[:8]
    payments_serializer = FeePaymentSerializer(recent_payments, many=True)

    return Response({
        "total_billed": float(total_billed),
        "total_collected": float(total_collected),
        "total_outstanding": float(total_outstanding),
        "collection_rate": collection_rate,
        "total_accounts": records.count(),
        "total_defaulters_count": total_defaulters_count,
        "status_distribution": status_counts,
        "category_breakdown": category_summary,
        "recent_payments": payments_serializer.data,
    }, status=status.HTTP_200_OK)


# =====================================================================
# 2. STUDENT FEE RECORDS DIRECTORY & FILTERS
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def list_student_fee_records(request):
    """
    Search and filter student fee accounts by branch, year, status, category, or search keyword.
    """
    branch = request.query_params.get('branch')
    year = request.query_params.get('year')
    status_param = request.query_params.get('status')
    category_id = request.query_params.get('category')
    search_q = request.query_params.get('q')
    has_dues = request.query_params.get('has_dues')

    qs = StudentFeeRecord.objects.select_related('student', 'fee_category', 'cleared_by').prefetch_related('payments').all()

    if branch and branch.upper() != 'ALL':
        qs = qs.filter(student__branch__iexact=branch)
    if year and year != 'ALL':
        qs = qs.filter(student__year=year)
    if status_param and status_param.upper() != 'ALL':
        qs = qs.filter(status=status_param.upper())
    if category_id and category_id.upper() != 'ALL':
        qs = qs.filter(fee_category_id=category_id)
    if search_q:
        q = search_q.strip()
        qs = qs.filter(
            Q(student__name__icontains=q) |
            Q(student__roll_no__icontains=q) |
            Q(student__student_id__icontains=q) |
            Q(student__email__icontains=q)
        )

    records = list(qs)
    if has_dues == 'true':
        records = [r for r in records if r.balance_due > Decimal('0.00')]

    serializer = StudentFeeRecordSerializer(records, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


# =====================================================================
# 3. RECORD FEE PAYMENT & AUTOMATED RECEIPT GENERATION
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def record_fee_payment(request):
    """
    Records a payment against a student fee record (offline cash, UPI, Bank Transfer).
    Auto-updates balance due and generates a unique tamper-proof receipt number.
    Payload:
      - fee_record_id: int (required)
      - amount_paid: float/decimal (required)
      - payment_method: str ('UPI', 'NET_BANKING', 'CARD', 'CASH', 'CHEQUE')
      - transaction_reference: str (optional)
      - remarks: str (optional)
    """
    record_id = request.data.get('fee_record_id')
    amount_paid_raw = request.data.get('amount_paid')
    payment_method = request.data.get('payment_method', 'UPI')
    transaction_ref = (request.data.get('transaction_reference') or '').strip()
    remarks = (request.data.get('remarks') or '').strip()

    if not record_id or amount_paid_raw is None:
        return Response({"detail": "fee_record_id and amount_paid are required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        amount_paid = Decimal(str(amount_paid_raw))
        if amount_paid <= 0:
            return Response({"detail": "Payment amount must be greater than zero."}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        return Response({"detail": "Invalid amount_paid format."}, status=status.HTTP_400_BAD_REQUEST)

    fee_record = get_object_or_404(StudentFeeRecord.objects.select_related('student', 'fee_category'), id=record_id)
    student = fee_record.student

    # Create Payment
    payment = FeePayment.objects.create(
        fee_record=fee_record,
        student=student,
        amount_paid=amount_paid,
        payment_method=payment_method,
        transaction_reference=transaction_ref,
        collected_by=request.user if request.user.is_authenticated else None,
        remarks=remarks
    )

    fee_record.refresh_from_db()

    # Log in institutional audit log
    AuditLog.log(
        action='STUDENT_UPDATE',
        entity='FeePayment',
        entity_id=str(payment.id),
        description=(
            f"Collected fee payment of ₹{amount_paid} ({payment.get_payment_method_display()}) "
            f"for student {student.name} ({student.roll_no}) under {fee_record.fee_category.name}. "
            f"Receipt No: {payment.receipt_number}. Balance Remaining: ₹{fee_record.balance_due}"
        ),
        user=request.user,
        request=request
    )

    # In-App Notification to Student
    user_for_student = getattr(getattr(student, 'user_profile', None), 'user', None)
    if user_for_student:
        Notification.objects.create(
            user=user_for_student,
            title=f"Fee Payment Confirmed: ₹{amount_paid} ✅",
            message=(
                f"Your payment of ₹{amount_paid} for {fee_record.fee_category.name} has been processed successfully. "
                f"Receipt Number: {payment.receipt_number}. Remaining Balance: ₹{fee_record.balance_due}."
            ),
            notification_type='academic'
        )

    return Response({
        "success": True,
        "message": f"Payment of ₹{amount_paid} recorded successfully.",
        "receipt_number": payment.receipt_number,
        "payment": FeePaymentSerializer(payment).data,
        "fee_record": StudentFeeRecordSerializer(fee_record).data,
    }, status=status.HTTP_201_CREATED)


# =====================================================================
# 4. DIGITAL RECEIPT DETAILS (PRINTABLE / DOWNLOADABLE)
# =====================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_fee_receipt(request, receipt_number):
    """
    Returns complete official university receipt data for printing and verification.
    Accessible to Admin, Teachers, and the student who owns the payment.
    """
    payment = get_object_or_404(
        FeePayment.objects.select_related('student', 'fee_record__fee_category', 'collected_by'),
        receipt_number=receipt_number
    )

    profile = getattr(request.user, 'profile', None)
    role = getattr(profile, 'role', 'admin') if profile else ('admin' if request.user.is_staff else None)

    if role == 'student':
        if not profile or not profile.student or payment.student.id != profile.student.id:
            return Response({"detail": "Permission denied to view this receipt."}, status=status.HTTP_403_FORBIDDEN)

    record = payment.fee_record
    student = payment.student

    receipt_data = {
        "institution_name": "ST. PETER'S ENGINEERING COLLEGE (AUTONOMOUS)",
        "institution_sub": "Approved by AICTE, Affiliated to JNTUH, Accredited with NAAC 'A+' Grade",
        "institution_address": "Opp. Forest Academy, Dullapally, Maisammaguda, Medchal, Hyderabad, Telangana 500043",
        "receipt_number": payment.receipt_number,
        "payment_date": payment.payment_date.strftime('%d-%b-%Y %I:%M %p'),
        "transaction_reference": payment.transaction_reference or "N/A (Cash / Counter)",
        "payment_method": payment.get_payment_method_display(),
        "student": {
            "id": student.id,
            "name": student.name,
            "roll_no": student.roll_no,
            "branch": student.branch,
            "cohort": f"{student.branch} Year {student.year} Sem {student.semester}-{student.section}",
            "email": student.email,
            "phone": student.phone,
        },
        "fee_details": {
            "category": record.fee_category.name,
            "academic_year": record.academic_year,
            "semester": f"Semester {record.semester}",
            "total_fee": float(record.total_amount),
            "discount_waiver": float(record.discount_amount),
            "net_payable": float(record.net_amount),
            "amount_paid_this_transaction": float(payment.amount_paid),
            "cumulative_paid_amount": float(record.paid_amount),
            "remaining_balance_due": float(record.balance_due),
            "status": record.get_status_display(),
            "is_cleared_for_exam": record.is_cleared_for_exam,
        },
        "remarks": payment.remarks or "Payment received with thanks.",
        "collected_by": payment.collected_by.get_full_name() or payment.collected_by.username if payment.collected_by else "Accounts Section",
        "verification_token": f"VERIFY-{payment.receipt_number}",
    }

    return Response(receipt_data, status=status.HTTP_200_OK)


# =====================================================================
# 5. NO-DUES EXAM CLEARANCE OVERRIDE
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def clear_exam_fee_dues(request, record_id):
    """
    Bursar or Administrator issues a formal No-Dues Clearance certificate for exam hall ticket release,
    even if partial fee balance remains (e.g. pending scholarship disbursement or Dean approval).
    """
    fee_record = get_object_or_404(StudentFeeRecord.objects.select_related('student', 'fee_category'), id=record_id)
    clear_status = request.data.get('is_cleared', True)
    remarks = (request.data.get('remarks') or '').strip()

    fee_record.is_cleared_for_exam = bool(clear_status)
    if fee_record.is_cleared_for_exam:
        fee_record.cleared_by = request.user
        fee_record.cleared_at = timezone.now()
        fee_record.clearance_remarks = remarks or "Approved by Bursar / Finance Office"
    else:
        fee_record.cleared_by = None
        fee_record.cleared_at = None
        fee_record.clearance_remarks = remarks or "Clearance revoked"

    fee_record.save()

    AuditLog.log(
        action='STUDENT_UPDATE',
        entity='StudentFeeRecord',
        entity_id=str(fee_record.id),
        description=(
            f"{'Granted' if fee_record.is_cleared_for_exam else 'Revoked'} Exam Fee Clearance (No-Dues) "
            f"for {fee_record.student.name} ({fee_record.student.roll_no}) - {fee_record.fee_category.name}. Remarks: {remarks}"
        ),
        user=request.user,
        request=request
    )

    return Response({
        "success": True,
        "message": f"Exam clearance {'granted' if fee_record.is_cleared_for_exam else 'revoked'} successfully.",
        "record": StudentFeeRecordSerializer(fee_record).data
    }, status=status.HTTP_200_OK)


# =====================================================================
# 6. BULK SEMESTER FEE INVOICE GENERATOR FOR COHORTS
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def bulk_generate_cohort_fees(request):
    """
    Automatically creates semester fee invoices for an entire branch / year / section.
    Payload:
      - academic_year: str (e.g. '2025-2026')
      - branch: str ('ALL', 'CSE', etc.)
      - year: int
      - semester: int
      - fee_category_id: int
      - amount: float
      - due_date: YYYY-MM-DD
    """
    data = request.data
    acad_year = data.get('academic_year', '2025-2026')
    branch = data.get('branch', 'ALL')
    year = int(data.get('year', 1))
    semester = int(data.get('semester', 1))
    category_id = data.get('fee_category_id')
    amount_val = data.get('amount')
    due_date_str = data.get('due_date')

    if not category_id or amount_val is None:
        return Response({"detail": "fee_category_id and amount are required."}, status=status.HTTP_400_BAD_REQUEST)

    category = get_object_or_404(FeeCategory, id=category_id)
    amount = Decimal(str(amount_val))
    due_date = None
    if due_date_str:
        try:
            due_date = datetime.strptime(str(due_date_str)[:10], '%Y-%m-%d').date()
        except Exception:
            pass

    students = Student.objects.filter(is_active=True)
    if branch != 'ALL':
        students = students.filter(branch__iexact=branch)
    if year:
        students = students.filter(year=year)

    created_count = 0
    updated_count = 0

    for stu in students:
        rec, created = StudentFeeRecord.objects.get_or_create(
            student=stu,
            fee_category=category,
            academic_year=acad_year,
            semester=semester,
            defaults={
                'year': year,
                'total_amount': amount,
                'due_date': due_date,
            }
        )
        if created:
            created_count += 1
        else:
            # If already exists and unpaid, update total amount
            if rec.paid_amount == Decimal('0.00'):
                rec.total_amount = amount
                rec.due_date = due_date or rec.due_date
                rec.save()
                updated_count += 1

    AuditLog.log(
        action='STUDENT_UPDATE',
        entity='FeeStructure',
        entity_id=str(category.id),
        description=f"Generated {created_count} fee invoices of ₹{amount} for {branch} Y{year}S{semester} ({category.name}).",
        user=request.user,
        request=request
    )

    return Response({
        "success": True,
        "message": f"Successfully generated {created_count} new invoices and updated {updated_count} existing records.",
        "created_count": created_count,
        "updated_count": updated_count,
        "category": category.name,
        "amount": float(amount),
    }, status=status.HTTP_200_OK)


# =====================================================================
# 7. SEND FEE SHORTAGE REMINDER EMAIL TO STUDENT & PARENT
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def send_fee_reminder(request):
    """
    Dispatches a formal fee reminder notice to the student and parent via Email.
    Warns that unpaid fee dues will result in exam hall ticket blockage.
    """
    record_id = request.data.get('fee_record_id')
    test_email = (request.data.get('test_email') or '').strip()

    fee_record = get_object_or_404(
        StudentFeeRecord.objects.select_related('student', 'fee_category'),
        id=record_id
    )
    student = fee_record.student

    recipients = []
    if test_email:
        recipients.append(test_email)
    else:
        if student.email:
            recipients.append(student.email.strip())
        parent_email = (getattr(student, 'parent_email', '') or '').strip()
        if parent_email and parent_email != student.email:
            recipients.append(parent_email)

    subject = f"⚠️ URGENT: College Fee Dues Reminder - {student.name} ({student.roll_no})"
    due_str = fee_record.due_date.strftime('%d-%b-%Y') if fee_record.due_date else 'Immediate'

    plain_message = (
        f"OFFICE OF THE BURSAR & FINANCIAL AFFAIRS\n"
        f"FEE DUES PAYMENT NOTICE\n\n"
        f"Dear Parent/Guardian and {student.name},\n\n"
        f"This is an official notice regarding the pending fee balance for {student.name} ({student.roll_no}), "
        f"enrolled in {student.branch} Year {student.year}.\n\n"
        f"Fee Category: {fee_record.fee_category.name}\n"
        f"Net Payable Amount: ₹{fee_record.net_amount:,.2f}\n"
        f"Total Paid: ₹{fee_record.paid_amount:,.2f}\n"
        f"Outstanding Balance Due: ₹{fee_record.balance_due:,.2f}\n"
        f"Due Date: {due_str}\n\n"
        f"IMPORTANT EXAMINATION NOTICE:\n"
        f"As per university rules, semester end examination hall tickets are locked until all mandatory "
        f"college dues are cleared. Please arrange payment promptly to prevent examination debarment.\n\n"
        f"Payment can be made at the college accounts counter or through student portal online banking.\n\n"
        f"Office of the Bursar\n"
        f"St. Peter's Engineering College"
    )

    html_message = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family:'Segoe UI',Arial,sans-serif; background-color:#f8fafc; padding:24px; color:#1e293b;">
      <table width="100%" max-width="600" style="margin:0 auto; background:#ffffff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color:#ffffff; padding:24px;">
            <div style="font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#94a3b8;">
              St. Peter's Engineering College • Accounts Division
            </div>
            <h2 style="margin:6px 0 0 0; color:#f87171;">
              💳 College Fee Payment Notice
            </h2>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p>Dear <strong>{student.name}</strong> and Parent/Guardian,</p>
            <p>Please note that college fee dues are outstanding for your academic enrollment:</p>
            
            <table width="100%" style="background:#fff5f5; border:1px solid #fecaca; border-radius:8px; padding:16px; margin:16px 0;">
              <tr>
                <td><strong>Fee Category:</strong></td>
                <td>{fee_record.fee_category.name}</td>
              </tr>
              <tr>
                <td><strong>Net Amount:</strong></td>
                <td>₹{fee_record.net_amount:,.2f}</td>
              </tr>
              <tr>
                <td><strong>Amount Paid:</strong></td>
                <td><span style="color:#059669; font-weight:700;">₹{fee_record.paid_amount:,.2f}</span></td>
              </tr>
              <tr>
                <td><strong>Outstanding Balance:</strong></td>
                <td><span style="color:#dc2626; font-size:18px; font-weight:800;">₹{fee_record.balance_due:,.2f}</span></td>
              </tr>
              <tr>
                <td><strong>Due Date:</strong></td>
                <td><strong>{due_str}</strong></td>
              </tr>
            </table>

            <div style="background:#fef2f2; border-left:4px solid #dc2626; padding:12px; border-radius:4px; font-size:13px; color:#991b1b; margin-bottom:20px;">
              <strong>Exam Clearance Alert:</strong> Students with uncleared fee dues will have their Semester Examination Hall Tickets locked in compliance with institutional regulations.
            </div>

            <p style="font-size:13px; color:#64748b;">
              Please make payment at the Accounts Counter or online through the Student Portal. Ignore this reminder if payment has already been completed.
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

    email_sent = False
    if recipients:
        try:
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'Accounts Division <accounts@spechyd.ac.in>')
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=from_email,
                recipient_list=recipients,
                html_message=html_message,
                fail_silently=False
            )
            email_sent = True
        except Exception as e:
            logger.warning(f"Failed to send fee reminder to {recipients}: {e}")

    return Response({
        "success": True,
        "message": f"Fee reminder notice dispatched to {', '.join(recipients) if recipients else 'Console'}.",
        "recipients": recipients,
        "email_sent": email_sent,
        "balance_due": float(fee_record.balance_due),
    }, status=status.HTTP_200_OK)


# =====================================================================
# 8. STUDENT SELF-SERVICE PORTAL FEE VIEW
# =====================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_fees_view(request):
    """
    Logged-in student views their own fee accounts, dues, payments, and receipt list.
    """
    profile = getattr(request.user, 'profile', None)
    if not profile or not profile.student:
        return Response({"detail": "Student profile not found."}, status=status.HTTP_404_NOT_FOUND)

    student = profile.student
    records = StudentFeeRecord.objects.filter(student=student).select_related('fee_category').prefetch_related('payments')

    total_billed = sum([r.net_amount for r in records]) or Decimal('0.00')
    total_paid = sum([r.paid_amount for r in records]) or Decimal('0.00')
    total_due = sum([r.balance_due for r in records]) or Decimal('0.00')

    # All mandatory fees cleared?
    has_mandatory_dues = any([r.balance_due > Decimal('0.00') and r.fee_category.is_mandatory_for_exam and not r.is_cleared_for_exam for r in records])
    is_exam_eligible_by_fees = not has_mandatory_dues

    serializer = StudentFeeRecordSerializer(records, many=True)

    return Response({
        "student_id": student.id,
        "student_name": student.name,
        "student_roll_no": student.roll_no,
        "total_billed": float(total_billed),
        "total_paid": float(total_paid),
        "total_due": float(total_due),
        "is_exam_eligible_by_fees": is_exam_eligible_by_fees,
        "records": serializer.data,
    }, status=status.HTTP_200_OK)


# =====================================================================
# 9. FEE CATEGORIES CRUD
# =====================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsTeacherOrAdmin])
def list_create_categories(request):
    if request.method == 'GET':
        categories = FeeCategory.objects.all()
        return Response(FeeCategorySerializer(categories, many=True).data)
    elif request.method == 'POST':
        serializer = FeeCategorySerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
