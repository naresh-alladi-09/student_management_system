import math
from datetime import date, timedelta
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsStudent
from students.models import Student, AcademicClass, FacultyAssignment
from performance.models import Subject
from audit.models import AuditLog
from .models import AttendanceSession, AttendanceRecord
from .serializers import AttendanceSessionSerializer, AttendanceRecordSerializer


# =====================================================================
# TEACHER / ADMIN: QR ATTENDANCE SESSION MANAGEMENT
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def create_attendance_session(request):
    """
    Teacher starts an attendance session for a subject and optional section/class.
    Payload: { "subject_id": 1, "duration_seconds": 60, "class_id": 2, "section": "A" }
    Returns: newly created session with temporary secure QR token.
    """
    subject_id = request.data.get('subject_id')
    duration_seconds = int(request.data.get('duration_seconds', 60))
    class_id = request.data.get('class_id') or request.data.get('academic_class_id')
    section_val = request.data.get('section', 'A')

    if not subject_id:
        return Response({"detail": "subject_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        subject = Subject.objects.get(id=subject_id)
    except Subject.DoesNotExist:
        return Response({"detail": "Subject not found."}, status=status.HTTP_404_NOT_FOUND)

    academic_class = None
    if class_id:
        try:
            academic_class = AcademicClass.objects.get(id=class_id)
            section_val = academic_class.section
        except AcademicClass.DoesNotExist:
            return Response({"detail": f"AcademicClass with ID {class_id} not found."}, status=status.HTTP_404_NOT_FOUND)

    # Validate Teacher Permission:
    # If the user is not staff/admin, check if they are authorized to teach this subject
    is_admin = request.user.is_staff or request.user.is_superuser or (
        hasattr(request.user, 'profile') and request.user.profile.role == 'admin'
    )
    if not is_admin:
        teacher_assignments = FacultyAssignment.objects.filter(teacher=request.user)
        if teacher_assignments.exists():
            assignment_qs = teacher_assignments.filter(subject=subject)
            if academic_class:
                assignment_qs = assignment_qs.filter(academic_class=academic_class)
            if not assignment_qs.exists():
                return Response(
                    {"detail": f"You are not assigned to conduct attendance for {subject.name} ({subject.code})."},
                    status=status.HTTP_403_FORBIDDEN
                )

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
        duration_seconds=duration_seconds,
        academic_class=academic_class,
        section=section_val
    )

    AuditLog.log(
        action='ATTENDANCE_SESSION_START',
        entity='AttendanceSession',
        entity_id=str(session.id),
        description=f"Faculty '{request.user.username}' started QR attendance session for {subject.code} (Section {section_val}).",
        user=request.user,
        request=request
    )

    serializer = AttendanceSessionSerializer(session)
    return Response({
        "message": f"Attendance session started for {subject.name} ({subject.code}).",
        "session": serializer.data
    }, status=status.HTTP_201_CREATED)


def finalize_session_attendance(session):
    """
    Ensure all enrolled students for this session's class/cohort have an AttendanceRecord
    in the database. Those who marked QR are already 'Present'. Remaining enrolled students
    are saved as 'Absent'.
    """
    if not session:
        return
    try:
        if session.academic_class:
            students = Student.objects.filter(academic_class=session.academic_class, is_active=True)
            if not students.exists():
                ac = session.academic_class
                students = Student.objects.filter(
                    branch__iexact=ac.branch.code,
                    year=ac.year,
                    semester=str(ac.semester),
                    is_active=True
                )
                if ac.section and ac.section.upper() != 'ALL':
                    students = students.filter(section__iexact=ac.section)
        elif session.subject and session.subject.branch:
            students = Student.objects.filter(branch__iexact=session.subject.branch, is_active=True)
        else:
            students = Student.objects.filter(is_active=True)

        existing_student_ids = set(
            AttendanceRecord.objects.filter(session=session).values_list('student_id', flat=True)
        )

        absent_records = []
        for s in students:
            if s.id not in existing_student_ids:
                absent_records.append(
                    AttendanceRecord(
                        student=s,
                        session=session,
                        subject=session.subject,
                        date=session.date,
                        status='Absent',
                        marked_via='System',
                        remarks='Absent - QR session completed'
                    )
                )
        if absent_records:
            AttendanceRecord.objects.bulk_create(absent_records, ignore_conflicts=True)
    except Exception as e:
        print(f"Error finalizing attendance: {e}")


@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def get_active_session(request):
    """
    Returns the most recent active session for the logged-in teacher,
    along with attendees and live stats.
    If the session recently expired, it will continue to appear for 10 minutes
    showing all students who are marked Present.
    """
    now_local = timezone.localtime()
    today_date = now_local.date()

    # 1. Check for live active session today
    session = AttendanceSession.objects.filter(
        teacher=request.user,
        is_active=True,
        date=today_date
    ).order_by('-created_at').first()

    is_live = False
    target_session = None

    if session:
        if not session.is_expired():
            is_live = True
            target_session = session
        else:
            session.is_active = False
            session.save(update_fields=['is_active'])
            finalize_session_attendance(session)
            # Check if within 10-minute post-session review window
            if now_local <= session.expires_at + timedelta(minutes=10):
                target_session = session
                is_live = False

    # 2. If no active session, look for the most recent session conducted today that completed within the last 10 minutes
    if not target_session:
        ten_mins_ago = now_local - timedelta(minutes=10)
        recent = AttendanceSession.objects.filter(
            teacher=request.user,
            date=today_date,
            expires_at__gte=ten_mins_ago,
            expires_at__lte=now_local
        ).order_by('-expires_at').first()

        if recent:
            target_session = recent
            is_live = False

    if not target_session:
        return Response({"active": False, "session": None}, status=status.HTTP_200_OK)

    review_expires_at = target_session.expires_at + timedelta(minutes=10)
    review_remaining_seconds = max(0, int((review_expires_at - now_local).total_seconds()))

    serializer = AttendanceSessionSerializer(target_session)
    present_records = AttendanceRecord.objects.filter(
        session=target_session,
        status='Present'
    ).select_related('student').order_by('marked_at')

    attendees = [
        {
            "student_id": r.student.id,
            "name": r.student.name,
            "roll_no": r.student.roll_no,
            "branch": r.student.branch,
            "status": r.status,
            "marked_at": r.marked_at.isoformat(),
        }
        for r in present_records
    ]

    if target_session.academic_class:
        total_enrolled = Student.objects.filter(academic_class=target_session.academic_class, is_active=True).count()
    else:
        total_enrolled = Student.objects.filter(branch__iexact=target_session.subject.branch, is_active=True).count()
    if total_enrolled == 0:
        total_enrolled = Student.objects.filter(is_active=True).count()

    present_count = len(attendees)
    absent_count = max(0, total_enrolled - present_count)
    rate = round((present_count / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0

    return Response({
        "active": is_live,
        "is_completed": not is_live,
        "show_present_for_10_mins": True,
        "review_remaining_seconds": review_remaining_seconds if not is_live else None,
        "review_expires_at": review_expires_at.isoformat() if not is_live else None,
        "session": serializer.data,
        "total_enrolled": total_enrolled,
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
    Permanently stores all attendance records in database.
    """
    try:
        session = AttendanceSession.objects.get(id=session_id, teacher=request.user)
    except AttendanceSession.DoesNotExist:
        return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    session.close()
    finalize_session_attendance(session)

    AuditLog.log(
        action='ATTENDANCE_SESSION_CLOSE',
        entity='AttendanceSession',
        entity_id=str(session.id),
        description=f"Faculty '{request.user.username}' closed attendance session #{session.id} for {session.subject.code} (Section {session.section or 'All'}). Records saved to database.",
        user=request.user,
        request=request
    )

    return Response({
        "message": "Attendance session closed and stored in database successfully.",
        "session_id": session.id,
        "is_active": False,
        "show_present_for_10_mins": True
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def get_session_attendees(request, session_id):
    """
    Get full list of students marked Present (stored in database) for a specific session.
    Provides 10-minute review window metadata if session recently concluded.
    """
    session = get_object_or_404(AttendanceSession, pk=session_id)

    # Permission check: must be assigned teacher or admin
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin and session.teacher != request.user:
        return Response(
            {'detail': 'You can only view attendance for sessions conducted by you.'},
            status=status.HTTP_403_FORBIDDEN
        )

    now_local = timezone.localtime()
    review_expires_at = session.expires_at + timedelta(minutes=10)
    is_within_10_mins = (now_local <= review_expires_at)
    review_remaining_seconds = max(0, int((review_expires_at - now_local).total_seconds())) if is_within_10_mins else 0

    present_records = AttendanceRecord.objects.filter(
        session=session,
        status='Present'
    ).select_related('student').order_by('marked_at')

    attendees = [
        {
            "student_id": r.student.id,
            "name": r.student.name,
            "roll_no": r.student.roll_no,
            "branch": r.student.branch,
            "status": r.status,
            "marked_at": r.marked_at.isoformat(),
        }
        for r in present_records
    ]

    if session.academic_class:
        total_enrolled = Student.objects.filter(academic_class=session.academic_class, is_active=True).count()
    else:
        total_enrolled = Student.objects.filter(branch__iexact=session.subject.branch, is_active=True).count()
    if total_enrolled == 0:
        total_enrolled = Student.objects.filter(is_active=True).count()

    present_count = len(attendees)
    absent_count = max(0, total_enrolled - present_count)
    rate = round((present_count / total_enrolled * 100), 1) if total_enrolled > 0 else 0.0

    return Response({
        "session_id": session.id,
        "subject_name": session.subject.name,
        "subject_code": session.subject.code,
        "date": session.date.isoformat(),
        "is_active": session.is_active,
        "is_within_10_mins": is_within_10_mins,
        "review_remaining_seconds": review_remaining_seconds,
        "review_expires_at": review_expires_at.isoformat(),
        "stored_in_db": True,
        "total_enrolled": total_enrolled,
        "present_count": present_count,
        "absent_count": absent_count,
        "attendance_rate": rate,
        "attendees": attendees,
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
            {"detail": "This lecture period has ended. QR attendance is closed."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 4. Validate Student Eligibility for this Subject / Academic Class
    if session.academic_class:
        target_class = session.academic_class
        student_class = student.academic_class
        is_enrolled = False
        if student_class and student_class.id == target_class.id:
            is_enrolled = True
        elif (
            student.branch.upper() == target_class.branch.code.upper() and
            int(student.year) == int(target_class.year) and
            str(student.semester) == str(target_class.semester) and
            (target_class.section.upper() in ['ALL', ''] or student.section.upper() in ['ALL', ''] or student.section.upper() == target_class.section.upper())
        ):
            is_enrolled = True

        if not is_enrolled:
            return Response(
                {
                    "detail": f"Access denied. You are not enrolled in {target_class.display_name}. This session is restricted to students of this section.",
                    "student_class": f"{student.branch} Y{student.year}S{student.semester}-{student.section}",
                    "session_class": target_class.display_name
                },
                status=status.HTTP_403_FORBIDDEN
            )
    elif session.subject and session.subject.branch:
        if student.branch.upper() != session.subject.branch.upper():
            return Response(
                {
                    "detail": f"Access denied. This subject ({session.subject.code}) is for {session.subject.branch} department, but you are enrolled in {student.branch}.",
                    "student_branch": student.branch,
                    "subject_branch": session.subject.branch
                },
                status=status.HTTP_403_FORBIDDEN
            )

    # 5. Check for duplicate attendance for this session
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

    # 6. Create AttendanceRecord atomically
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

        AuditLog.log(
            action='ATTENDANCE_QR_MARK',
            entity='AttendanceRecord',
            entity_id=str(record.id),
            description=f"Student '{student.name}' ({student.roll_no}) marked QR attendance for {session.subject.code}.",
            user=user,
            request=request
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
    year = request.query_params.get('year', None)
    semester = request.query_params.get('semester', None)
    section = request.query_params.get('section', None)

    students_qs = Student.objects.filter(is_active=True).order_by('id')
    if branch and branch.upper() != 'ALL':
        students_qs = students_qs.filter(branch__iexact=branch)
    if year and year.upper() != 'ALL':
        students_qs = students_qs.filter(year=year)
    if semester and semester.upper() != 'ALL':
        students_qs = students_qs.filter(semester=semester)
    if section and section.upper() != 'ALL':
        students_qs = students_qs.filter(section__iexact=section)

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
            "section": s.section,
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
    # Real attendance shortage calculation:
    # Target = 75%. If P / T < 0.75:
    # Need x consecutive classes such that (P + x) / (T + x) >= 0.75
    # => P + x >= 0.75T + 0.75x => 0.25x >= 0.75T - P => x >= 3T - 4P
    threshold = float(request.query_params.get('threshold', 75.0))
    shortage_warning = False
    classes_needed_for_75 = 0
    if total > 0 and rate < threshold:
        shortage_warning = True
        needed = math.ceil((threshold / (100 - threshold)) * total - (100 / (100 - threshold)) * present) if threshold < 100 else 0
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
        sub_absent = sub_recs.filter(status='Absent').count()
        sub_rate = round((sub_present / sub_total * 100), 1) if sub_total > 0 else 0.0
        sub_needed = max(0, math.ceil(3 * sub_total - 4 * sub_present)) if sub_total > 0 and sub_rate < threshold else 0
        sub_is_shortage = sub_total > 0 and sub_rate < threshold

        subject_stats.append({
            "code": sub.code,
            "name": sub.name,
            "credits": sub.credits,
            "total_classes": sub_total,
            "total": sub_total,
            "attended": sub_present,
            "present": sub_present,
            "missed": sub_total - sub_present,
            "absent": sub_absent,
            "attendance_rate": sub_rate,
            "percentage": sub_rate,
            "is_shortage": sub_is_shortage,
            "classes_needed_for_75": sub_needed,
            "warning": (
                f"Your {sub.name} attendance is {sub_rate}%. Your attendance is below the required threshold of {threshold}%."
                if sub_is_shortage else ""
            ),
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

    overall_warning = (
        f"Your overall attendance is {rate}%. Your attendance is below the required threshold of {threshold}%."
        if shortage_warning else ""
    )

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
        "warning_message": overall_warning,
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
    Institutional aggregate attendance analytics dashboard:
    Overall stats, branch-wise, year-wise, section-wise, subject-wise,
    low-attendance students (< threshold, default 75%), and 7-day attendance trends.
    """
    today = date.today()
    threshold = float(request.query_params.get('threshold', 75.0))

    # All active students
    active_students = list(Student.objects.filter(is_active=True))
    total_students = len(active_students)

    # Today's records
    records_today = AttendanceRecord.objects.filter(date=today)
    present_today = records_today.filter(status='Present').count()
    absent_today = records_today.filter(status='Absent').count()
    not_marked_today = max(0, total_students - present_today - absent_today)
    today_rate = round((present_today / total_students * 100), 1) if total_students > 0 else 0.0

    # Cumulative records
    all_records = AttendanceRecord.objects.all()
    total_recs = all_records.count()
    present_recs = all_records.filter(status='Present').count()
    cumulative_rate = round((present_recs / total_recs * 100), 1) if total_recs > 0 else 0.0

    # Low attendance students calculation
    student_records_map = {}
    for rec in all_records.values('student_id', 'status'):
        sid = rec['student_id']
        if sid not in student_records_map:
            student_records_map[sid] = {'present': 0, 'total': 0}
        student_records_map[sid]['total'] += 1
        if rec['status'] == 'Present':
            student_records_map[sid]['present'] += 1

    low_attendance_list = []
    for s in active_students:
        s_stats = student_records_map.get(s.id, {'present': 0, 'total': 0})
        s_total = s_stats['total']
        s_present = s_stats['present']
        s_rate = round((s_present / s_total * 100), 1) if s_total > 0 else 0.0

        if s_total > 0 and s_rate < threshold:
            needed = max(0, math.ceil(3 * s_total - 4 * s_present))
            low_attendance_list.append({
                "student_id": s.id,
                "name": s.name,
                "roll_no": s.roll_no or f"STU-{s.id:03d}",
                "branch": s.branch,
                "year": s.year,
                "semester": s.semester,
                "section": s.section,
                "attended": s_present,
                "total": s_total,
                "attendance_rate": s_rate,
                "classes_needed": needed,
                "warning": f"{s.name}'s attendance is {s_rate}%, which is below the {threshold}% threshold."
            })

    # Sort low attendance students ascending by rate
    low_attendance_list.sort(key=lambda x: x['attendance_rate'])

    # Branch-wise analytics
    branches = {}
    for s in active_students:
        b = (s.branch or 'General').upper()
        if b not in branches:
            branches[b] = {'students': 0, 'present': 0, 'total': 0}
        branches[b]['students'] += 1
        st_data = student_records_map.get(s.id, {'present': 0, 'total': 0})
        branches[b]['present'] += st_data['present']
        branches[b]['total'] += st_data['total']

    branch_wise = [
        {
            "branch": b,
            "total_students": data['students'],
            "attended": data['present'],
            "total_classes": data['total'],
            "attendance_rate": round((data['present'] / data['total'] * 100), 1) if data['total'] > 0 else 0.0
        }
        for b, data in sorted(branches.items())
    ]

    # Year-wise analytics
    years = {}
    for s in active_students:
        y = s.year or 1
        if y not in years:
            years[y] = {'students': 0, 'present': 0, 'total': 0}
        years[y]['students'] += 1
        st_data = student_records_map.get(s.id, {'present': 0, 'total': 0})
        years[y]['present'] += st_data['present']
        years[y]['total'] += st_data['total']

    year_wise = [
        {
            "year": y,
            "total_students": data['students'],
            "attended": data['present'],
            "total_classes": data['total'],
            "attendance_rate": round((data['present'] / data['total'] * 100), 1) if data['total'] > 0 else 0.0
        }
        for y, data in sorted(years.items())
    ]

    # Section-wise analytics
    sections = {}
    for s in active_students:
        sec = s.section or 'A'
        if sec not in sections:
            sections[sec] = {'students': 0, 'present': 0, 'total': 0}
        sections[sec]['students'] += 1
        st_data = student_records_map.get(s.id, {'present': 0, 'total': 0})
        sections[sec]['present'] += st_data['present']
        sections[sec]['total'] += st_data['total']

    section_wise = [
        {
            "section": sec,
            "total_students": data['students'],
            "attended": data['present'],
            "total_classes": data['total'],
            "attendance_rate": round((data['present'] / data['total'] * 100), 1) if data['total'] > 0 else 0.0
        }
        for sec, data in sorted(sections.items())
    ]

    # Subject-wise analytics
    subjects = Subject.objects.all()
    subject_wise = []
    for sub in subjects:
        sub_recs = AttendanceRecord.objects.filter(subject=sub)
        st_total = sub_recs.count()
        st_present = sub_recs.filter(status='Present').count()
        s_rate = round((st_present / st_total * 100), 1) if st_total > 0 else 0.0
        subject_wise.append({
            "code": sub.code,
            "name": sub.name,
            "branch": sub.branch,
            "semester": sub.semester,
            "total_classes": st_total,
            "attended": st_present,
            "attendance_rate": s_rate
        })

    # 7-day attendance trends
    trends = []
    from datetime import timedelta
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        day_recs = AttendanceRecord.objects.filter(date=d)
        d_total = day_recs.count()
        d_present = day_recs.filter(status='Present').count()
        d_rate = round((d_present / d_total * 100), 1) if d_total > 0 else 0.0
        trends.append({
            "date": d.isoformat(),
            "day": d.strftime('%a'),
            "present": d_present,
            "total": d_total,
            "attendance_rate": d_rate
        })

    return Response({
        "threshold": threshold,
        "date": today.isoformat(),
        "overall": {
            "total_students": total_students,
            "present_today": present_today,
            "absent_today": absent_today,
            "not_marked_today": not_marked_today,
            "today_attendance_rate": today_rate,
            "cumulative_attendance_rate": cumulative_rate,
            "total_records": total_recs,
            "low_attendance_count": len(low_attendance_list)
        },
        "low_attendance_students": low_attendance_list,
        "branch_wise": branch_wise,
        "year_wise": year_wise,
        "section_wise": section_wise,
        "subject_wise": subject_wise,
        "recent_trends": trends
    }, status=status.HTTP_200_OK)

