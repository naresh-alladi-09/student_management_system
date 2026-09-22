import math
from datetime import date
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsStudent
from students.models import Student
from performance.models import Subject
from .models import AttendanceSession, AttendanceRecord
from .serializers import AttendanceSessionSerializer, AttendanceRecordSerializer


# =====================================================================
# TEACHER / ADMIN: QR ATTENDANCE SESSION MANAGEMENT
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def create_attendance_session(request):
    """
    Teacher starts an attendance session for a subject.
    Payload: { "subject_id": 1, "duration_seconds": 60 }
    Returns: newly created session with temporary secure QR token.
    """
    subject_id = request.data.get('subject_id')
    duration_seconds = int(request.data.get('duration_seconds', 60))

    if not subject_id:
        return Response({"detail": "subject_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        subject = Subject.objects.get(id=subject_id)
    except Subject.DoesNotExist:
        return Response({"detail": "Subject not found."}, status=status.HTTP_404_NOT_FOUND)

    # Deactivate any previous active sessions by this teacher for this subject today
    AttendanceSession.objects.filter(
        teacher=request.user,
        subject=subject,
        is_active=True,
        date=date.today()
    ).update(is_active=False)

    session = AttendanceSession.create_session(
        subject=subject,
        teacher=request.user,
        duration_seconds=duration_seconds
    )

    serializer = AttendanceSessionSerializer(session)
    return Response({
        "message": f"Attendance session started for {subject.name} ({subject.code}).",
        "session": serializer.data
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def get_active_session(request):
    """
    Returns the most recent active session for the logged-in teacher,
    along with attendees and live stats.
    """
    session = AttendanceSession.objects.filter(
        teacher=request.user,
        is_active=True,
        date=date.today()
    ).order_by('-created_at').first()

    if not session:
        return Response({"active": False, "session": None}, status=status.HTTP_200_OK)

    # Check if expired
    if session.is_expired():
        session.is_active = False
        session.save(update_fields=['is_active'])
        return Response({
            "active": False,
            "session": None,
            "detail": "Session expired."
        }, status=status.HTTP_200_OK)

    serializer = AttendanceSessionSerializer(session)
    records = AttendanceRecord.objects.filter(session=session).select_related('student')
    attendees = [
        {
            "student_id": r.student.id,
            "name": r.student.name,
            "roll_no": r.student.roll_no,
            "branch": r.student.branch,
            "status": r.status,
            "marked_at": r.marked_at.isoformat(),
        }
        for r in records
    ]

    total_branch_students = Student.objects.filter(branch__iexact=session.subject.branch, is_active=True).count()
    if total_branch_students == 0:
        total_branch_students = Student.objects.filter(is_active=True).count()

    present_count = len(attendees)
    absent_count = max(0, total_branch_students - present_count)
    rate = round((present_count / total_branch_students * 100), 1) if total_branch_students > 0 else 0.0

    return Response({
        "active": True,
        "session": serializer.data,
        "total_enrolled": total_branch_students,
        "present_count": present_count,
        "absent_count": absent_count,
        "attendance_rate": rate,
        "attendees": attendees,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def refresh_session_token(request, session_id):
    """
    Teacher refreshes temporary QR token for an active session.
    """
    try:
        session = AttendanceSession.objects.get(id=session_id, teacher=request.user)
    except AttendanceSession.DoesNotExist:
        return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    duration = int(request.data.get('duration_seconds', session.duration_seconds or 60))
    new_token = session.refresh_token(duration_seconds=duration)

    serializer = AttendanceSessionSerializer(session)
    return Response({
        "message": "QR token refreshed successfully.",
        "session": serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def close_attendance_session(request, session_id):
    """
    Teacher closes an active attendance session.
    """
    try:
        session = AttendanceSession.objects.get(id=session_id, teacher=request.user)
    except AttendanceSession.DoesNotExist:
        return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    session.close()
    return Response({
        "message": "Attendance session closed successfully.",
        "session_id": session.id,
        "is_active": False
    }, status=status.HTTP_200_OK)


# =====================================================================
# STUDENT: QR ATTENDANCE SUBMISSION
# =====================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_qr_attendance(request):
    """
    Authenticated student scans or submits the temporary QR token.
    Validates token, active session, expiration, and ensures no duplicate attendance.
    """
    user = request.user
    profile = getattr(user, 'profile', None)

    if not profile or profile.role != 'student' or not profile.student:
        return Response(
            {"detail": "Only authenticated students can mark QR attendance."},
            status=status.HTTP_403_FORBIDDEN
        )

    student = profile.student
    if not student.is_active:
        return Response(
            {"detail": "Your student account is deactivated. Contact administration."},
            status=status.HTTP_403_FORBIDDEN
        )

    token = (request.data.get('qr_token') or request.data.get('token') or '').strip()
    if not token:
        return Response(
            {"detail": "QR token is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # If the student camera or scanner passed the full URL (e.g. http://host/mark-attendance?token=XYZ)
    if 'token=' in token:
        import urllib.parse
        try:
            parsed = urllib.parse.urlparse(token)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'token' in qs and qs['token']:
                token = qs['token'][0].strip()
        except Exception:
            pass

    # 1. Look up session by token
    session = AttendanceSession.objects.filter(qr_token=token).select_related('subject', 'teacher').first()
    if not session:
        return Response(
            {"detail": "Invalid QR code or token."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 2. Check if session is active
    if not session.is_active:
        return Response(
            {"detail": "This attendance session has ended."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 3. Check expiration
    if session.is_expired():
        session.is_active = False
        session.save(update_fields=['is_active'])
        return Response(
            {"detail": "QR code has expired. Please ask the faculty to refresh the code."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 4. Check for duplicate attendance for this session
    existing = AttendanceRecord.objects.filter(student=student, session=session).first()
    if existing:
        return Response(
            {
                "detail": f"You have already marked attendance for this session at {existing.marked_at.strftime('%I:%M %p')}.",
                "already_marked": True,
                "marked_at": existing.marked_at.isoformat()
            },
            status=status.HTTP_409_CONFLICT
        )

    # 5. Create AttendanceRecord atomically
    with transaction.atomic():
        record = AttendanceRecord.objects.create(
            student=student,
            session=session,
            subject=session.subject,
            date=session.date,
            status='Present',
            marked_via='QR',
            remarks=f"Marked via live QR session by {student.name}"
        )

    return Response({
        "success": True,
        "message": f"Attendance successfully recorded for {session.subject.name} ({session.subject.code})!",
        "subject": session.subject.name,
        "subject_code": session.subject.code,
        "date": session.date.isoformat(),
        "marked_at": record.marked_at.isoformat(),
        "status": "Present"
    }, status=status.HTTP_201_CREATED)


# =====================================================================
# TEACHER / ADMIN: DAILY ATTENDANCE & BULK SAVE
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def get_daily_attendance(request):
    """
    Get attendance for all active students on a given date (default: today).
    If no record exists for a student, returns status='Not Marked' (NO FAKE DEFAULTS).
    """
    query_date_str = request.query_params.get('date', None)
    if query_date_str:
        try:
            target_date = date.fromisoformat(query_date_str)
        except ValueError:
            return Response({"error": "Invalid date format. Expected YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        target_date = date.today()

    branch = request.query_params.get('branch', None)
    students_qs = Student.objects.filter(is_active=True).order_by('id')
    if branch and branch.upper() != 'ALL':
        students_qs = students_qs.filter(branch__iexact=branch)

    existing_records = {
        rec.student_id: rec.status
        for rec in AttendanceRecord.objects.filter(date=target_date)
    }

    results = []
    for s in students_qs:
        st = existing_records.get(s.id, "Not Marked")
        results.append({
            "student_id": s.id,
            "name": s.name,
            "roll_no": s.roll_no or f"STU-2024-{s.id:03d}",
            "student_id_str": s.student_id or f"STU2024{s.id:04d}",
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
            "status": st
        })

    present_count = sum(1 for r in results if r["status"] == "Present")
    absent_count = sum(1 for r in results if r["status"] == "Absent")
    not_marked_count = sum(1 for r in results if r["status"] == "Not Marked")
    total = len(results)
    rate = round((present_count / total * 100), 1) if total > 0 else 0.0

    return Response({
        "date": target_date.isoformat(),
        "total_students": total,
        "present_count": present_count,
        "absent_count": absent_count,
        "not_marked_count": not_marked_count,
        "attendance_rate": rate,
        "records": results,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def bulk_save_attendance(request):
    """
    Bulk update or create manual attendance for students on a given date.
    Payload: { "date": "YYYY-MM-DD", "attendance": { "1": "Present", "2": "Absent" }, "subject_id": optional }
    """
    date_str = request.data.get('date')
    attendance_map = request.data.get('attendance', {})
    subject_id = request.data.get('subject_id', None)

    if not date_str:
        return Response({"error": "Date is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        return Response({"error": "Invalid date format. Expected YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    subject_obj = None
    if subject_id:
        subject_obj = Subject.objects.filter(id=subject_id).first()

    with transaction.atomic():
        saved_count = 0
        for student_id_raw, status_val in attendance_map.items():
            if status_val not in ['Present', 'Absent', 'Late']:
                continue
            try:
                sid = int(student_id_raw)
                AttendanceRecord.objects.update_or_create(
                    student_id=sid,
                    date=target_date,
                    defaults={
                        'status': status_val,
                        'subject': subject_obj,
                        'marked_via': 'MANUAL'
                    }
                )
                saved_count += 1
            except Exception as e:
                return Response(
                    {"error": f"Error saving student {student_id_raw}: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

    return Response({
        "message": f"Attendance successfully saved for {saved_count} students on {target_date}.",
        "date": target_date.isoformat(),
        "count": saved_count
    }, status=status.HTTP_200_OK)


# =====================================================================
# STUDENT & COMMON: ATTENDANCE SUMMARY & SHORTAGE ENGINE
# =====================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSelfOrStaff])
def student_attendance_detail(request, student_id):
    """
    Returns authentic database attendance summary, subject breakdown,
    shortage warning, and classes required to reach 75%.
    """
    try:
        student = Student.objects.get(id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

    # Enforce student isolation: students can only access their own attendance records
    profile = getattr(request.user, 'profile', None)
    if profile and profile.role == 'student':
        if not profile.student or profile.student.id != student.id:
            return Response(
                {"detail": "You do not have permission to access another student's records."},
                status=status.HTTP_403_FORBIDDEN
            )

    records = AttendanceRecord.objects.filter(student=student).order_by('-date')
    total = records.count()
    present = records.filter(status='Present').count()
    absent = records.filter(status='Absent').count()
    late = records.filter(status='Late').count()

    rate = round((present / total * 100), 1) if total > 0 else 0.0

    # Real attendance shortage calculation:
    # Target = 75%. If P / T < 0.75:
    # Need x consecutive classes such that (P + x) / (T + x) >= 0.75
    # => P + x >= 0.75T + 0.75x => 0.25x >= 0.75T - P => x >= 3T - 4P
    shortage_warning = False
    classes_needed_for_75 = 0
    if total > 0 and rate < 75.0:
        shortage_warning = True
        needed = math.ceil(3 * total - 4 * present)
        classes_needed_for_75 = max(0, needed)

    # Subject-wise attendance calculation
    subject_stats = []
    subjects = Subject.objects.filter(branch__iexact=student.branch)
    if not subjects.exists():
        subjects = Subject.objects.all()

    for sub in subjects:
        sub_recs = AttendanceRecord.objects.filter(student=student, subject=sub)
        sub_total = sub_recs.count()
        sub_present = sub_recs.filter(status='Present').count()
        sub_rate = round((sub_present / sub_total * 100), 1) if sub_total > 0 else 0.0
        sub_needed = max(0, math.ceil(3 * sub_total - 4 * sub_present)) if sub_total > 0 and sub_rate < 75.0 else 0

        subject_stats.append({
            "code": sub.code,
            "name": sub.name,
            "credits": sub.credits,
            "total_classes": sub_total,
            "attended": sub_present,
            "missed": sub_total - sub_present,
            "attendance_rate": sub_rate,
            "is_shortage": sub_total > 0 and sub_rate < 75.0,
            "classes_needed_for_75": sub_needed,
        })

    history = [
        {
            "id": r.id,
            "date": r.date.isoformat(),
            "status": r.status,
            "subject": r.subject.name if r.subject else "General Session",
            "subject_code": r.subject.code if r.subject else "",
            "marked_via": r.marked_via,
            "marked_at": r.marked_at.isoformat(),
            "remarks": r.remarks
        }
        for r in records[:50]
    ]

    return Response({
        "student_id": student.id,
        "name": student.name,
        "roll_no": student.roll_no or f"STU-2024-{student.id:03d}",
        "student_id_str": student.student_id or f"STU2024{student.id:04d}",
        "total_classes": total,
        "attended_classes": present,
        "missed_classes": absent,
        "late_classes": late,
        "attendance_rate": rate,
        "shortage_warning": shortage_warning,
        "classes_needed_for_75": classes_needed_for_75,
        "subject_breakdown": subject_stats,
        "history": history
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_attendance_view(request):
    """
    Direct endpoint for logged-in student to view their attendance.
    """
    user = request.user
    profile = getattr(user, 'profile', None)
    if not profile or profile.role != 'student' or not profile.student:
        return Response({"error": "Student profile not found."}, status=status.HTTP_404_NOT_FOUND)

    return student_attendance_detail(request._request, profile.student.id)


@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def attendance_summary(request):
    """
    College-wide / department aggregate attendance stats.
    """
    today = date.today()
    students_count = Student.objects.filter(is_active=True).count()
    records_today = AttendanceRecord.objects.filter(date=today)
    present_today = records_today.filter(status='Present').count()

    rate = round((present_today / students_count * 100), 1) if students_count > 0 else 0.0

    return Response({
        "total_students": students_count,
        "present_today": present_today,
        "attendance_rate": rate,
        "date": today.isoformat()
    }, status=status.HTTP_200_OK)
