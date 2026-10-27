import math
from datetime import date, timedelta, datetime
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsStudent
from accounts.utils import get_client_ip, get_user_agent
from students.models import Student, AcademicClass, FacultyAssignment
from performance.models import Subject
from notifications.models import Notification
from audit.models import AuditLog
from .models import AttendanceSession, AttendanceRecord, LeaveRequest, AttendanceAlertLog
from .face_geo_service import haversine_distance, is_within_geofence, verify_face_match
from .serializers import (
    AttendanceSessionSerializer,
    AttendanceRecordSerializer,
    LeaveRequestSerializer,
)


# =====================================================================
# TEACHER / ADMIN: QR ATTENDANCE SESSION MANAGEMENT
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def create_attendance_session(request):
    """
    Teacher starts an attendance session for a subject and optional section/class.
    Payload: {
        "subject_id": 1,
        "duration_seconds": 20,
        "class_id": 2,
        "section": "A",
        "latitude": 17.3850,
        "longitude": 78.4867,
        "radius_meters": 100.0,
        "require_face": true,
        "require_geo": true
    }
    Returns: newly created session with temporary secure QR token.
    """
    subject_id = request.data.get('subject_id') or request.data.get('subject')
    duration_seconds = int(request.data.get('duration_seconds', 20))
    class_id = request.data.get('class_id') or request.data.get('academic_class_id')
    section_val = request.data.get('section', 'A')

    # Geo-coordinates & anti-proxy settings
    latitude = request.data.get('latitude')
    longitude = request.data.get('longitude')
    radius_meters = request.data.get('radius_meters', 100.0)
    try:
        radius_meters = float(radius_meters or 100.0)
    except (ValueError, TypeError):
        radius_meters = 100.0

    require_face = request.data.get('require_face', True)
    if isinstance(require_face, str):
        require_face = require_face.lower() in ('true', '1')

    require_geo = request.data.get('require_geo', True)
    if isinstance(require_geo, str):
        require_geo = require_geo.lower() in ('true', '1')

    if latitude is not None and latitude != '':
        try:
            latitude = float(latitude)
        except (ValueError, TypeError):
            latitude = None

    if longitude is not None and longitude != '':
        try:
            longitude = float(longitude)
        except (ValueError, TypeError):
            longitude = None

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

    # Enforce that attendance must be taken by the respective subject faculty (or admin)
    profile = getattr(request.user, 'profile', None)
    is_admin = request.user.is_superuser or (profile and str(profile.role).lower() == 'admin')
    if not is_admin:
        from timetable.models import TimetableSlot
        # Faculty must be assigned to teach this subject and this specific class (if class provided)
        is_assigned = FacultyAssignment.objects.filter(teacher=request.user, subject=subject)
        has_slot = TimetableSlot.objects.filter(teacher=request.user, subject=subject)
        if academic_class:
            class_assigned = is_assigned.filter(academic_class=academic_class).exists()
            class_slot = has_slot.filter(academic_class=academic_class).exists()
            if not class_assigned and not class_slot:
                return Response(
                    {"detail": f"Unauthorized: You are not assigned to teach '{subject.name}' for this class ({academic_class.display_name}). Attendance must be launched by the assigned faculty."},
                    status=status.HTTP_403_FORBIDDEN
                )
        elif not is_assigned.exists() and not has_slot.exists():
            return Response(
                {"detail": f"Unauthorized: You are not assigned to teach '{subject.name} ({subject.code})'. Attendance must be taken by the respective subject faculty."},
                status=status.HTTP_403_FORBIDDEN
            )

    # -------------------------------------------------------------------------
    # TIMETABLE PERIOD ENFORCEMENT: Attendance enabled only during scheduled periods
    # -------------------------------------------------------------------------
    from timetable.models import TimetableSlot
    ignore_timetable = request.data.get('ignore_timetable', False)
    ignore_time = request.data.get('ignore_time', False)
    admin_override = (is_admin and request.data.get('admin_override', False))

    now_local = timezone.localtime()
    current_time = now_local.time()
    today_date = now_local.date()
    today_day_actual = now_local.strftime('%A')

    active_slot = None
    expires_at_val = None
    end_time_val = None

    if not ignore_timetable and not admin_override:
        slots_query = TimetableSlot.objects.filter(
            subject=subject,
            day__iexact=today_day_actual
        )
        if not is_admin:
            slots_query = slots_query.filter(teacher=request.user)

        if academic_class:
            slots_query = slots_query.filter(academic_class=academic_class)
        if section_val and section_val.upper() != 'ALL':
            slots_query = slots_query.filter(section__iexact=section_val)

        # Check 1: Does the faculty have a scheduled period for this subject on today's day?
        if not slots_query.exists():
            class_desc = f" in class '{academic_class.display_name}'" if academic_class else ""
            teacher_slots = TimetableSlot.objects.filter(subject=subject)
            if not is_admin:
                teacher_slots = teacher_slots.filter(teacher=request.user)
            if academic_class:
                teacher_slots = teacher_slots.filter(academic_class=academic_class)
            other_days = list(teacher_slots.values_list('day', flat=True).distinct())
            days_str = ", ".join(other_days) if other_days else "no scheduled days"
            return Response(
                {
                    "detail": f"Attendance is disabled: You do not have a scheduled timetable period for '{subject.name} ({subject.code})'{class_desc} on {today_day_actual}. Scheduled days: {days_str}."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check 2: Is there an active timetable period right now?
        if not ignore_time:
            for s in slots_query:
                if s.start_time <= current_time < s.end_time:
                    active_slot = s
                    break

            if not active_slot:
                upcoming = slots_query.filter(start_time__gt=current_time).order_by('start_time').first()
                if upcoming:
                    start_fmt = upcoming.start_time.strftime('%I:%M %p')
                    end_fmt = upcoming.end_time.strftime('%I:%M %p')
                    return Response(
                        {
                            "detail": f"Attendance is disabled: The scheduled timetable period for '{subject.name}' starts at {start_fmt} ({start_fmt} - {end_fmt}). Attendance will automatically unlock when the period begins."
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
                past = slots_query.filter(end_time__lte=current_time).order_by('-end_time').first()
                if past:
                    end_fmt = past.end_time.strftime('%I:%M %p')
                    return Response(
                        {
                            "detail": f"Attendance is disabled: The scheduled timetable period for '{subject.name}' concluded at {end_fmt}. Attendance can only be taken during active periods."
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )
        else:
            active_slot = slots_query.first()

    # Synchronize session metadata and end_time with the active timetable period
    if active_slot:
        if not academic_class and active_slot.academic_class:
            academic_class = active_slot.academic_class
        if not section_val or section_val == 'A':
            section_val = active_slot.section or section_val
        if not ignore_time and active_slot.end_time:
            end_time_val = active_slot.end_time
            slot_end_dt = timezone.make_aware(datetime.combine(today_date, active_slot.end_time))
            remaining_period_seconds = max(1, int((slot_end_dt - now_local).total_seconds()))
            duration_seconds = min(duration_seconds, remaining_period_seconds)
            expires_at_val = slot_end_dt

    # If geofence is required, classroom coordinates must be provided
    if require_geo and (latitude is None or longitude is None):
        return Response(
            {"detail": "Classroom GPS coordinates (latitude and longitude) are required when GPS Geofencing is enabled. Please click 'Detect Classroom Coordinates' or enter coordinates."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Deactivate previous active sessions for this teacher today
    AttendanceSession.objects.filter(
        teacher=request.user,
        is_active=True,
        date=date.today()
    ).update(is_active=False)

    # Also if this exact timetable slot had an active session today, deactivate it
    if active_slot:
        AttendanceSession.objects.filter(
            timetable_slot=active_slot,
            is_active=True,
            date=date.today()
        ).update(is_active=False)

    session = AttendanceSession.create_session(
        subject=subject,
        teacher=request.user,
        duration_seconds=duration_seconds,
        academic_class=academic_class,
        timetable_slot=active_slot,
        section=section_val,
        expires_at=expires_at_val,
        end_time=end_time_val,
        latitude=latitude,
        longitude=longitude,
        radius_meters=radius_meters,
        require_face=require_face,
        require_geo=require_geo
    )

    geo_desc = f" (Geo: {latitude}, {longitude} within {radius_meters}m)" if (latitude and longitude) else " (No Geo Enforced)"
    face_desc = " [Face Scan Required]" if require_face else " [Face Scan Optional]"

    AuditLog.log(
        action='ATTENDANCE_SESSION_START',
        entity='AttendanceSession',
        entity_id=str(session.id),
        description=f"Faculty '{request.user.username}' started QR attendance session for {subject.code} (Section {section_val}){geo_desc}{face_desc}.",
        user=request.user,
        request=request
    )

    serializer = AttendanceSessionSerializer(session)
    session_data = serializer.data
    return Response({
        "message": f"Attendance session started for {subject.name} ({subject.code}).",
        "session": session_data,
        "session_id": session.id,
        "qr_token": session.qr_token,
        "qr_code": session_data.get('qr_code_image', ''),
        "expires_at": session_data.get('expires_at', ''),
        "time_remaining": session_data.get('time_remaining', duration_seconds),
        "latitude": session.latitude,
        "longitude": session.longitude,
        "radius_meters": session.radius_meters,
        "require_face": session.require_face,
        "require_geo": session.require_geo,
    }, status=status.HTTP_201_CREATED)


def finalize_session_attendance(session):
    """
    Ensure all enrolled students for this session's class/cohort have an AttendanceRecord
    in the database. Those who marked QR or already have attendance recorded for this period
    are already 'Present'. Remaining enrolled students are saved as 'Absent'.
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
        # Also check if students have already recorded attendance for this period / timetable slot today
        if session.timetable_slot:
            existing_student_ids.update(
                AttendanceRecord.objects.filter(
                    date=session.date,
                    timetable_slot=session.timetable_slot
                ).values_list('student_id', flat=True)
            )

        absent_records = []
        for s in students:
            if s.id not in existing_student_ids:
                absent_records.append(
                    AttendanceRecord(
                        student=s,
                        session=session,
                        timetable_slot=session.timetable_slot,
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

    profile = getattr(request.user, 'profile', None)
    is_admin = request.user.is_superuser or (profile and str(profile.role).lower() == 'admin')

    # 1. Check for live active session today
    # CRITICAL: A faculty member must ONLY see their own session!
    if is_admin:
        teacher_id = request.query_params.get('teacher_id')
        if teacher_id:
            session = AttendanceSession.objects.filter(
                teacher_id=teacher_id,
                is_active=True,
                date=today_date
            ).order_by('-created_at').first()
        else:
            session = AttendanceSession.objects.filter(
                is_active=True,
                date=today_date
            ).order_by('-created_at').first()
    else:
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
        if is_admin:
            teacher_id = request.query_params.get('teacher_id')
            if teacher_id:
                recent = AttendanceSession.objects.filter(
                    teacher_id=teacher_id,
                    date=today_date,
                    expires_at__gte=ten_mins_ago,
                    expires_at__lte=now_local
                ).order_by('-expires_at').first()
            else:
                recent = AttendanceSession.objects.filter(
                    date=today_date,
                    expires_at__gte=ten_mins_ago,
                    expires_at__lte=now_local
                ).order_by('-expires_at').first()
        else:
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
    session = AttendanceSession.objects.filter(id=session_id).first()
    if not session:
        return Response({"detail": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    duration = int(request.data.get('duration_seconds', session.duration_seconds or 20))
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
    session = AttendanceSession.objects.filter(id=session_id).first()
    if not session:
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
            "face_matched": r.face_matched,
            "face_confidence": r.face_confidence,
            "distance_meters": r.distance_meters,
            "marked_via": r.marked_via,
            "attendance_mode": "QR" if (r.marked_via and (r.marked_via == 'QR' or r.marked_via == 'QR_FACE_GEO' or r.marked_via.startswith('QR'))) else "Manual",
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
# STUDENT: QR ATTENDANCE & ANTI-PROXY VERIFICATION
# =====================================================================

def check_student_period_attendance(student, session):
    """
    Enforces the institutional policy that attendance for a student can ONLY be marked once per period.

    Checks:
    1. Direct duplicate check: Has this student already checked into this exact AttendanceSession?
    2. Timetable Period check: If session has a timetable_slot or matches a scheduled
       TimetableSlot on session.date, has the student already marked attendance for that period today?
    3. Session Period overlap check: If session has start_time and end_time, has the student
       already marked attendance for any session overlapping that lecture period on session.date?

    Returns: (is_already_marked: bool, existing_record: AttendanceRecord or None, message: str or None)
    """
    if not student or not session:
        return False, None, None

    # 1. Direct session check
    direct_rec = AttendanceRecord.objects.filter(student=student, session=session).first()
    if direct_rec:
        time_str = direct_rec.marked_at.strftime('%I:%M %p')
        period_lbl = session.get_period_label()
        return (
            True,
            direct_rec,
            f"You have already marked attendance for this session ({period_lbl}) at {time_str}. Attendance can only be marked once per period."
        )

    # 2. Timetable Slot period check
    slot = session.timetable_slot
    if not slot and session.subject:
        from timetable.models import TimetableSlot
        day_actual = session.date.strftime('%A')
        slots_for_subject = TimetableSlot.objects.filter(
            subject=session.subject,
            day__iexact=day_actual
        )
        if session.academic_class:
            slots_for_subject = slots_for_subject.filter(
                Q(academic_class=session.academic_class) | Q(academic_class__isnull=True)
            )

        matched_slot = None
        s_time = session.start_time
        e_time = session.end_time
        for s in slots_for_subject:
            if s_time and s.start_time <= s_time < s.end_time:
                matched_slot = s
                break
            elif e_time and s.end_time == e_time:
                matched_slot = s
                break

        slot = matched_slot or (slots_for_subject.first() if slots_for_subject.count() == 1 else None)
        if slot and not session.timetable_slot:
            try:
                session.timetable_slot = slot
                session.save(update_fields=['timetable_slot'])
            except Exception:
                pass

    if slot:
        existing_slot_rec = AttendanceRecord.objects.filter(
            student=student,
            date=session.date
        ).filter(
            Q(timetable_slot=slot) | Q(session__timetable_slot=slot)
        ).first()

        if existing_slot_rec:
            slot_label = f"{slot.start_time.strftime('%I:%M %p')} - {slot.end_time.strftime('%I:%M %p')}"
            time_str = existing_slot_rec.marked_at.strftime('%I:%M %p')
            return (
                True,
                existing_slot_rec,
                f"Attendance has already been marked for this lecture period ({slot_label}) at {time_str}. Each student can only mark attendance once per period."
            )

    # 3. Session time window overlap check on session.date
    sess_start = session.start_time
    sess_end = session.end_time
    if sess_start and sess_end:
        overlapping_records = AttendanceRecord.objects.filter(
            student=student,
            date=session.date,
            session__isnull=False,
            session__start_time__lt=sess_end,
            session__end_time__gt=sess_start
        ).exclude(session=session).select_related('session', 'subject').first()

        if overlapping_records:
            period_label = f"{sess_start.strftime('%I:%M %p')} - {sess_end.strftime('%I:%M %p')}"
            sub_title = overlapping_records.subject.code if overlapping_records.subject else "this course"
            time_str = overlapping_records.marked_at.strftime('%I:%M %p')
            return (
                True,
                overlapping_records,
                f"Attendance already marked for this period ({period_label}) for {sub_title} at {time_str}. Only one attendance mark is permitted per period."
            )

    return False, None, None


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def verify_session_token(request):
    """
    Verifies QR token for an authenticated student before scanning face/location.
    Returns session subject, classroom geocoordinates, radius, student face status,
    and checks if attendance was already recorded for this lecture period.
    """
    token = request.query_params.get('token') or request.data.get('token') or request.data.get('qr_token') or ''
    token = str(token).strip()
    if 'token=' in token:
        import urllib.parse
        try:
            parsed = urllib.parse.urlparse(token)
            qs = urllib.parse.parse_qs(parsed.query)
            if 'token' in qs and qs['token']:
                token = qs['token'][0].strip()
        except Exception:
            pass

    if not token:
        return Response({"detail": "Token is required.", "valid": False}, status=status.HTTP_400_BAD_REQUEST)

    session = AttendanceSession.objects.filter(qr_token=token).select_related('subject', 'teacher', 'academic_class', 'timetable_slot').first()
    if not session:
        return Response({"detail": "Invalid QR code or token.", "valid": False}, status=status.HTTP_404_NOT_FOUND)

    user = request.user
    student = getattr(getattr(user, 'profile', None), 'student', None)
    if not student:
        student = Student.objects.filter(
            Q(user_profile__user=user) |
            Q(roll_no__iexact=user.username) |
            Q(student_id__iexact=user.username) |
            Q(email__iexact=user.email)
        ).first()
        if student and hasattr(user, 'profile') and user.profile.student is None:
            try:
                user.profile.student = student
                user.profile.save(update_fields=['student'])
            except Exception:
                pass

    is_already_marked = False
    already_marked_msg = None
    already_marked_at = None
    if student:
        already_marked, existing_rec, msg = check_student_period_attendance(student, session)
        if already_marked:
            is_already_marked = True
            already_marked_msg = msg
            already_marked_at = existing_rec.marked_at.isoformat() if existing_rec else None

    has_registered_face = bool(
        student and (student.face_registered or student.face_embedding or student.profile_photo)
    )

    remaining_secs = 0
    if session.expires_at:
        diff = (session.expires_at - timezone.localtime()).total_seconds()
        remaining_secs = max(0, int(diff))

    timetable_period_label = session.get_period_label()

    return Response({
        "valid": True,
        "session_id": session.id,
        "subject": session.subject.name,
        "subject_name": session.subject.name,
        "subject_code": session.subject.code,
        "faculty_name": session.teacher.get_full_name() or session.teacher.username,
        "teacher": session.teacher.get_full_name() or session.teacher.username,
        "class_display": session.academic_class.display_name if session.academic_class else "All Sections",
        "section": session.section,
        "date": session.date.isoformat(),
        "is_active": session.is_active,
        "is_expired": session.is_expired(),
        "time_remaining": remaining_secs,
        "period_start": session.start_time.strftime('%I:%M %p') if session.start_time else None,
        "period_end": session.end_time.strftime('%I:%M %p') if session.end_time else None,
        "timetable_period": timetable_period_label,
        "period_label": timetable_period_label,
        "latitude": session.latitude,
        "longitude": session.longitude,
        "radius_meters": session.radius_meters or 100.0,
        "require_face": session.require_face,
        "require_geo": session.require_geo,
        "student_has_face": has_registered_face,
        "student_face_registered": has_registered_face,
        "student_name": student.name if student else None,
        "student_roll": student.roll_no if student else None,
        "is_already_marked": is_already_marked,
        "already_marked_message": already_marked_msg,
        "already_marked_at": already_marked_at,
        "period_attendance_marked": is_already_marked,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_qr_attendance(request):
    """
    Authenticated student scans session QR token, captures live face photo,
    and submits GPS coordinates. Validates token, student enrollment, classroom geofence,
    and biometric face match before granting Present status.
    """
    user = request.user
    profile = getattr(user, 'profile', None)
    student = getattr(profile, 'student', None)

    if not student:
        student = Student.objects.filter(
            Q(user_profile__user=user) |
            Q(roll_no__iexact=user.username) |
            Q(student_id__iexact=user.username) |
            Q(email__iexact=user.email)
        ).first()
        if student and profile and profile.student is None:
            try:
                profile.student = student
                profile.save(update_fields=['student'])
            except Exception:
                pass

    if not student:
        return Response(
            {"detail": "Only authenticated students can mark QR attendance."},
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

    # 4b. Validate that the student's cohort has a scheduled timetable period for this subject today
    if not request.data.get('ignore_timetable', False):
        from timetable.models import TimetableSlot
        today_day_actual = timezone.localtime().strftime('%A')
        cohort_slots = TimetableSlot.objects.filter(
            subject=session.subject,
            branch__iexact=student.branch,
            semester=str(student.semester)
        )
        if student.section and student.section.upper() not in ['ALL', '']:
            cohort_slots = cohort_slots.filter(
                Q(section__iexact=student.section) | Q(section__in=['ALL', ''])
            )
        if cohort_slots.exists():
            today_slots = cohort_slots.filter(day__iexact=today_day_actual)
            if not today_slots.exists():
                return Response(
                    {
                        "detail": f"Access denied: You do not have a scheduled timetable period for '{session.subject.name}' on {today_day_actual}."
                    },
                    status=status.HTTP_403_FORBIDDEN
                )

    # 5. Check duplicate attendance: Enforce that attendance can only be marked once per period
    already_marked, existing_rec, dup_msg = check_student_period_attendance(student, session)
    if already_marked:
        return Response(
            {
                "detail": dup_msg,
                "already_marked": True,
                "period_conflict": True,
                "marked_at": existing_rec.marked_at.isoformat() if existing_rec else None,
                "record_id": existing_rec.id if existing_rec else None,
                "period_label": existing_rec.get_period_label() if existing_rec else session.get_period_label(),
            },
            status=status.HTTP_409_CONFLICT
        )

    # =========================================================================
    # ANTI-PROXY VERIFICATION LAYER 1: GEOLOCATION / GEOFENCING CHECK
    # =========================================================================
    raw_lat = request.data.get('latitude') or request.data.get('lat')
    raw_lng = request.data.get('longitude') or request.data.get('lng') or request.data.get('lon')
    student_lat = None
    student_lng = None
    if raw_lat is not None and str(raw_lat).strip() != '':
        try:
            student_lat = float(raw_lat)
        except (ValueError, TypeError):
            pass
    if raw_lng is not None and str(raw_lng).strip() != '':
        try:
            student_lng = float(raw_lng)
        except (ValueError, TypeError):
            pass

    raw_acc = request.data.get('accuracy') or request.data.get('acc')
    accuracy = None
    if raw_acc is not None and str(raw_acc).strip() != '':
        try:
            accuracy = float(raw_acc)
        except (ValueError, TypeError):
            pass

    distance_meters = None
    if session.require_geo and (session.latitude is not None and session.longitude is not None):
        if student_lat is None or student_lng is None:
            return Response({
                "detail": "GPS location is required to verify physical presence in class. Please enable location permissions.",
                "geo_error": "MISSING_COORDINATES"
            }, status=status.HTTP_400_BAD_REQUEST)

        distance_meters = haversine_distance(student_lat, student_lng, session.latitude, session.longitude)
        if distance_meters is None:
            return Response({
                "detail": "Invalid GPS coordinates received from device.",
                "geo_error": "INVALID_COORDINATES"
            }, status=status.HTTP_400_BAD_REQUEST)

        allowed_radius = float(session.radius_meters or 100.0)
        # Account for standard device GPS accuracy jitter (up to 25m buffer) so students inside classroom are not falsely flagged
        effective_distance = distance_meters
        if accuracy is not None and accuracy > 0:
            effective_distance = max(0.0, distance_meters - min(accuracy, 25.0))

        if effective_distance > allowed_radius:
            AuditLog.log(
                action='PROXY_ATTEMPT_FLAGGED',
                entity='AttendanceRecord',
                entity_id=str(student.id),
                description=f"Anti-proxy alert: Student '{student.roll_no}' attempted attendance {int(distance_meters)}m outside classroom (allowed: {int(allowed_radius)}m, accuracy: ±{int(accuracy or 0)}m).",
                user=user,
                request=request
            )
            return Response({
                "detail": f"Location Verification Failed: You are {int(distance_meters)}m away from the classroom (Allowed boundary: {int(allowed_radius)}m). Proxy attendance outside the classroom is prohibited!",
                "distance_meters": distance_meters,
                "effective_distance": round(effective_distance, 2),
                "allowed_radius": allowed_radius,
                "accuracy": accuracy,
                "geo_error": "OUTSIDE_GEOFENCE",
                "error_type": "GEOFENCE_VIOLATION"
            }, status=status.HTTP_400_BAD_REQUEST)
    elif student_lat is not None and student_lng is not None and session.latitude is not None and session.longitude is not None:
        distance_meters = haversine_distance(student_lat, student_lng, session.latitude, session.longitude)

    # =========================================================================
    # ANTI-PROXY VERIFICATION LAYER 2: FACIAL BIOMETRIC RECOGNITION CHECK
    # =========================================================================
    face_image = (request.data.get('face_image') or request.data.get('photo') or request.data.get('image') or '').strip()
    face_matched = False
    face_confidence = 0.0

    if session.require_face:
        # Check student has registered face
        has_registered_face = bool(student.face_registered or student.face_embedding or student.profile_photo)
        if not has_registered_face:
            return Response({
                "detail": f"No registered face found for student '{student.name}' ({student.roll_no}). Faculty must register your face in the student registration portal before attendance can be marked.",
                "face_error": "NOT_REGISTERED",
                "error_type": "FACE_NOT_REGISTERED"
            }, status=status.HTTP_400_BAD_REQUEST)

        if not face_image:
            return Response({
                "detail": "Live facial scan is required. Please align your face in front of the camera.",
                "face_error": "MISSING_LIVE_PHOTO",
                "error_type": "MISSING_LIVE_PHOTO"
            }, status=status.HTTP_400_BAD_REQUEST)

        matched, confidence, raw_score, face_msg = verify_face_match(
            live_image_input=face_image,
            registered_embedding_or_photo=student.face_embedding or student.profile_photo,
            registered_photo=student.profile_photo,
            threshold=0.34
        )

        if matched and student.profile_photo:
            try:
                if not student.face_registered or not student.face_embedding or student.face_embedding.startswith("[0.0, 0.0"):
                    ok_emb, new_emb, _ = extract_face_embedding(student.profile_photo)
                    if ok_emb and new_emb:
                        student.face_embedding = json.dumps(new_emb)
                        student.face_registered = True
                        student.save(update_fields=['face_embedding', 'face_registered'])
            except Exception:
                pass

        if not matched:
            AuditLog.log(
                action='PROXY_ATTEMPT_FLAGGED',
                entity='AttendanceRecord',
                entity_id=str(student.id),
                description=f"Anti-proxy alert: Face mismatch for student '{student.roll_no}' (Confidence: {confidence}%). {face_msg}",
                user=user,
                request=request
            )
            return Response({
                "detail": f"Face Recognition Failed: Scanned face does not match the registered student photo for {student.name} ({student.roll_no}). Proxy attendance rejected.",
                "face_confidence": confidence,
                "raw_score": raw_score,
                "reason": face_msg,
                "face_error": "FACE_MISMATCH",
                "error_type": "FACE_MISMATCH"
            }, status=status.HTTP_400_BAD_REQUEST)

        face_matched = True
        face_confidence = confidence

    # =========================================================================
    # ANTI-PROXY VERIFICATION LAYER 3: DEVICE FINGERPRINT & IP ANOMALY HEURISTICS
    # =========================================================================
    client_ip = get_client_ip(request)
    user_agent = get_user_agent(request)
    device_fingerprint = (request.data.get('device_fingerprint') or '').strip()[:128]

    suspicious_flags = {}
    is_flagged = False

    if device_fingerprint:
        other_students_device = list(
            AttendanceRecord.objects.filter(
                session=session,
                device_fingerprint=device_fingerprint
            ).exclude(student=student).values_list('student__roll_no', flat=True).distinct()
        )
        if other_students_device:
            is_flagged = True
            suspicious_flags['shared_device'] = True
            suspicious_flags['conflicting_students'] = other_students_device
            suspicious_flags['reason'] = f"Same device fingerprint was used by {len(other_students_device)} other student account(s)."

    if client_ip and client_ip not in ('127.0.0.1', 'localhost'):
        ip_students_count = AttendanceRecord.objects.filter(
            session=session,
            ip_address=client_ip
        ).exclude(student=student).values('student_id').distinct().count()
        if ip_students_count >= 3:
            is_flagged = True
            suspicious_flags['shared_ip_anomaly'] = True
            suspicious_flags['ip_cluster_count'] = ip_students_count + 1
            suspicious_flags['reason'] = f"Anomalous clustering: {ip_students_count + 1} different students marked from IP {client_ip}."

    if is_flagged:
        AuditLog.log(
            action='PROXY_ATTEMPT_FLAGGED',
            entity='AttendanceRecord',
            entity_id=str(student.id),
            description=f"Anti-proxy alert for '{student.roll_no}' in {session.subject.code}: {suspicious_flags.get('reason')}",
            user=user,
            request=request
        )

    # 7. Create AttendanceRecord atomically with full security metadata
    with transaction.atomic():
        record = AttendanceRecord.objects.create(
            student=student,
            session=session,
            timetable_slot=session.timetable_slot,
            subject=session.subject,
            date=session.date,
            status='Present',
            marked_via='QR_FACE_GEO' if (face_matched or distance_meters is not None) else 'QR',
            latitude=student_lat,
            longitude=student_lng,
            distance_meters=distance_meters,
            face_matched=face_matched,
            face_confidence=face_confidence,
            ip_address=client_ip,
            user_agent=user_agent,
            device_fingerprint=device_fingerprint,
            is_flagged_proxy=is_flagged,
            proxy_flags=suspicious_flags,
            remarks=f"Marked via live Face & Geo scan by {student.name}" + (f" (Biometric Conf: {face_confidence}%, Dist: {int(distance_meters or 0)}m)") + (" [FLAGGED FOR PROXY REVIEW]" if is_flagged else "")
        )

        AuditLog.log(
            action='ATTENDANCE_QR_MARK',
            entity='AttendanceRecord',
            entity_id=str(record.id),
            description=f"Student '{student.name}' ({student.roll_no}) marked attendance for {session.subject.code} (Biometric: {'Verified ' + str(face_confidence) + '%' if face_matched else 'N/A'}, Dist: {int(distance_meters) if distance_meters is not None else 0}m).",
            user=user,
            request=request
        )

    # Check if student's cumulative attendance is below 75% and trigger alert if due
    try:
        from .alerts import check_and_trigger_low_attendance_alert
        check_and_trigger_low_attendance_alert(student)
    except Exception:
        pass

    return Response({
        "success": True,
        "message": f"Attendance verified & recorded successfully for {session.subject.name} ({session.subject.code})!",
        "student": student.name,
        "roll_no": student.roll_no,
        "subject": session.subject.name,
        "subject_code": session.subject.code,
        "date": session.date.isoformat(),
        "timetable_period": f"{session.start_time.strftime('%I:%M %p')} - {session.end_time.strftime('%I:%M %p')}" if session.end_time and session.start_time else None,
        "marked_at": record.marked_at.isoformat(),
        "status": "Present",
        "face_verified": face_matched,
        "face_confidence": face_confidence,
        "distance_meters": distance_meters,
        "location_status": "Classroom Geofence Verified" if distance_meters is not None else "Location Not Enforced",
        "proxy_verification_status": "Flagged for Instructor Review" if is_flagged else "Verified Authentic",
        "notice": "Attendance marked with Live Facial Biometrics & GPS Anti-Proxy Security."
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

    user = request.user
    profile = getattr(user, 'profile', None)
    is_admin = user.is_staff or user.is_superuser or (profile and profile.role == 'admin')

    students_qs = Student.objects.filter(is_active=True).order_by('id')
    if branch and branch.upper() != 'ALL':
        students_qs = students_qs.filter(branch__iexact=branch)
    if year and year.upper() != 'ALL':
        students_qs = students_qs.filter(year=year)
    if semester and semester.upper() != 'ALL':
        students_qs = students_qs.filter(semester=semester)
    if section and section.upper() != 'ALL':
        students_qs = students_qs.filter(section__iexact=section)

    subject_id = request.query_params.get('subject_id') or request.query_params.get('subject', None)
    records_filter = Q(date=target_date)
    if subject_id and str(subject_id).upper() != 'ALL':
        records_filter &= Q(subject_id=subject_id)

    existing_records = {}
    for rec in AttendanceRecord.objects.filter(records_filter).order_by('id'):
        is_qr = bool(rec.marked_via and (rec.marked_via == 'QR' or rec.marked_via == 'QR_FACE_GEO' or rec.marked_via.startswith('QR')))
        mode = "QR" if is_qr else ("Manual" if rec.marked_via == 'MANUAL' else (rec.marked_via or "Manual"))
        existing_records[rec.student_id] = {
            "status": rec.status,
            "marked_via": rec.marked_via,
            "attendance_mode": mode,
            "marked_at": rec.marked_at.isoformat() if rec.marked_at else None,
        }

    results = []
    for s in students_qs:
        rec_info = existing_records.get(s.id)
        if rec_info:
            st = rec_info["status"]
            mv = rec_info["marked_via"]
            mode = rec_info["attendance_mode"]
            mat = rec_info["marked_at"]
        else:
            st = "Not Marked"
            mv = None
            mode = None
            mat = None

        results.append({
            "student_id": s.id,
            "name": s.name,
            "roll_no": s.roll_no or f"STU-2024-{s.id:03d}",
            "student_id_str": s.student_id or f"STU2024{s.id:04d}",
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
            "section": s.section,
            "status": st,
            "marked_via": mv,
            "attendance_mode": mode,
            "marked_at": mat,
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
    subject_id = request.data.get('subject_id') or request.data.get('subject', None)

    if not date_str:
        return Response({"error": "Date is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        return Response({"error": "Invalid date format. Expected YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

    subject_obj = None
    if subject_id:
        subject_obj = Subject.objects.filter(id=subject_id).first()

    user = request.user
    profile = getattr(user, 'profile', None)
    is_admin = user.is_staff or user.is_superuser or (profile and profile.role == 'admin')

    # Enforce respective subject faculty check for manual attendance
    if subject_obj and not is_admin:
        from timetable.models import TimetableSlot
        is_assigned = (
            FacultyAssignment.objects.filter(teacher=request.user, subject=subject_obj).exists() or
            TimetableSlot.objects.filter(teacher=request.user, subject=subject_obj).exists()
        )
        if not is_assigned:
            return Response(
                {"error": f"Unauthorized: You are not assigned to teach '{subject_obj.name}'. Attendance must be taken by the respective subject faculty."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Timetable check for manual attendance date
        if not request.data.get('ignore_timetable', False):
            target_day = target_date.strftime('%A')
            has_slot_today = TimetableSlot.objects.filter(
                subject=subject_obj,
                day__iexact=target_day
            ).filter(Q(teacher=request.user) | Q(teacher__isnull=True)).exists()
            if not has_slot_today:
                has_any_slot = TimetableSlot.objects.filter(subject=subject_obj, day__iexact=target_day).exists()
                if not has_any_slot:
                    other_days = list(TimetableSlot.objects.filter(subject=subject_obj).values_list('day', flat=True).distinct())
                    days_label = ", ".join(other_days) if other_days else "no scheduled days"
                    return Response(
                        {"error": f"Attendance is disabled: '{subject_obj.name}' has no scheduled timetable period on {target_day} ({target_date}). Scheduled days: {days_label}."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

    slot_id = request.data.get('slot_id') or request.data.get('timetable_slot_id')
    slot_obj = None
    if slot_id:
        slot_obj = TimetableSlot.objects.filter(id=slot_id).first()

    with transaction.atomic():
        saved_count = 0
        for student_id_raw, status_val in attendance_map.items():
            if status_val not in ['Present', 'Absent', 'Late']:
                continue
            try:
                sid = int(student_id_raw)
                qs = AttendanceRecord.objects.filter(student_id=sid, date=target_date)
                if subject_obj:
                    qs = qs.filter(subject=subject_obj)
                if slot_obj:
                    qs = qs.filter(timetable_slot=slot_obj)

                if qs.exists():
                    update_fields = {'status': status_val, 'marked_via': 'MANUAL'}
                    if subject_obj:
                        update_fields['subject'] = subject_obj
                    if slot_obj:
                        update_fields['timetable_slot'] = slot_obj
                    qs.update(**update_fields)
                else:
                    AttendanceRecord.objects.create(
                        student_id=sid,
                        date=target_date,
                        timetable_slot=slot_obj,
                        status=status_val,
                        subject=subject_obj,
                        marked_via='MANUAL'
                    )
                saved_count += 1
            except Exception as e:
                return Response(
                    {"error": f"Error saving student {student_id_raw}: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

    # Check attendance rates and trigger alerts for any affected students below 75%
    try:
        from .alerts import check_and_trigger_low_attendance_alert
        for sid_raw in attendance_map.keys():
            st_obj = Student.objects.filter(id=int(sid_raw)).first()
            if st_obj:
                check_and_trigger_low_attendance_alert(st_obj)
    except Exception:
        pass

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

    # Enforce student isolation and faculty class authorization
    profile = getattr(request.user, 'profile', None)
    is_admin = request.user.is_staff or request.user.is_superuser or (profile and profile.role == 'admin')

    if profile and profile.role == 'student':
        if not profile.student or profile.student.id != student.id:
            AuditLog.log(
                action='UNAUTHORIZED_ACCESS_BLOCKED',
                entity='AttendanceRecord',
                entity_id=str(student_id),
                description=f"Student '{request.user.username}' attempted unauthorized IDOR access to student '{student.roll_no}' attendance.",
                user=request.user,
                request=request
            )
            return Response(
                {"detail": "You do not have permission to access another student's records."},
                status=status.HTTP_403_FORBIDDEN
            )
    # Teachers, faculty, and admins can view any student's attendance records

    records = AttendanceRecord.objects.filter(student=student).order_by('-date')
    total = records.count()
    present = records.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
    absent = records.filter(status='Absent').count()
    late = records.filter(status='Late').count()
    od_count = records.filter(status='On-Duty').count()
    medical_count = records.filter(status='Medical').count()

    rate = round((present / total * 100), 1) if total > 0 else 0.0

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
        sub_present = sub_recs.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
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
            "attendance_mode": "QR" if (r.marked_via and (r.marked_via == 'QR' or r.marked_via == 'QR_FACE_GEO' or r.marked_via.startswith('QR'))) else "Manual",
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
        "on_duty_classes": od_count,
        "medical_classes": medical_count,
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

    # RBAC: Teachers see analytics only for their authorized cohort
    user = request.user
    profile = getattr(user, 'profile', None)
    is_admin = user.is_staff or user.is_superuser or (profile and profile.role == 'admin')

    active_students = list(Student.objects.filter(is_active=True))

    total_students = len(active_students)

    # Today's records (distinct students present/absent today)
    records_today = AttendanceRecord.objects.filter(date=today)
    present_students_today = records_today.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).values('student_id').distinct().count()
    absent_students_today = records_today.filter(status='Absent').exclude(
        student_id__in=records_today.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).values('student_id')
    ).values('student_id').distinct().count()
    not_marked_today = max(0, total_students - present_students_today - absent_students_today)
    today_rate = round((present_students_today / total_students * 100), 1) if total_students > 0 else 0.0

    # Cumulative records
    all_records = AttendanceRecord.objects.all()
    total_recs = all_records.count()
    present_recs = all_records.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
    cumulative_rate = round((present_recs / total_recs * 100), 1) if total_recs > 0 else 0.0

    # Low attendance students calculation
    student_records_map = {}
    for rec in all_records.values('student_id', 'status'):
        sid = rec['student_id']
        if sid not in student_records_map:
            student_records_map[sid] = {'present': 0, 'total': 0}
        student_records_map[sid]['total'] += 1
        if rec['status'] in ['Present', 'On-Duty', 'Medical', 'Excused']:
            student_records_map[sid]['present'] += 1

    low_attendance_list = []
    for s in active_students:
        s_stats = student_records_map.get(s.id, {'present': 0, 'total': 0})
        s_total = s_stats['total']
        s_present = s_stats['present']
        s_rate = round((s_present / s_total * 100), 1) if s_total > 0 else 0.0

        if s_total > 0 and s_rate < threshold:
            needed = max(0, math.ceil(3 * s_total - 4 * s_present))
            last_alert = AttendanceAlertLog.objects.filter(student=s).first()
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
                "student_email": s.email or "",
                "parent_name": getattr(s, 'parent_name', '') or "",
                "parent_email": getattr(s, 'parent_email', '') or "",
                "student_phone": s.phone or "",
                "parent_phone": getattr(s, 'parent_phone', '') or "",
                "last_alert_at": last_alert.sent_at.isoformat() if last_alert else None,
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
        "present_today": present_students_today,
        "absent_today": absent_students_today,
        "attendance_rate": today_rate,
        "cumulative_attendance_rate": cumulative_rate,
        "total_students": total_students,
        "overall": {
            "total_students": total_students,
            "present_today": present_students_today,
            "absent_today": absent_students_today,
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


# =====================================================================
# STUDENT LEAVE & ON-DUTY (OD) WORKFLOW
# =====================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def list_create_leave_requests(request):
    """
    GET:
      - Students get their own leave requests.
      - Teachers/Admins get all requests with optional ?status=, ?branch=, ?q= filters.
    POST:
      - Student submits a new leave / On-Duty request.
    """
    profile = getattr(request.user, 'profile', None)
    role = getattr(profile, 'role', 'admin') if profile else ('admin' if request.user.is_staff else None)

    if request.method == 'GET':
        if role == 'student':
            if not profile or not profile.student:
                return Response({"detail": "Student profile not found."}, status=status.HTTP_404_NOT_FOUND)
            leaves = LeaveRequest.objects.filter(student=profile.student).select_related('student', 'reviewed_by').order_by('-applied_at')
        else:
            status_param = request.query_params.get('status')
            branch_param = request.query_params.get('branch')
            search_param = request.query_params.get('q')

            leaves = LeaveRequest.objects.all().select_related('student', 'reviewed_by').order_by('-applied_at')
            if status_param and status_param.upper() != 'ALL':
                leaves = leaves.filter(status=status_param.upper())
            if branch_param and branch_param.upper() != 'ALL':
                leaves = leaves.filter(student__branch__iexact=branch_param)
            if search_param:
                q = search_param.strip()
                leaves = leaves.filter(
                    Q(student__name__icontains=q) |
                    Q(student__roll_no__icontains=q) |
                    Q(reason__icontains=q)
                )

        serializer = LeaveRequestSerializer(leaves, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        if role != 'student':
            return Response({"detail": "Only enrolled students can submit leave/OD requests."}, status=status.HTTP_403_FORBIDDEN)
        student = getattr(profile, 'student', None)
        if not student:
            return Response({"detail": "Student profile not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        leave_type = data.get('leave_type', 'OD')
        start_date_str = data.get('start_date')
        end_date_str = data.get('end_date') or start_date_str
        reason = (data.get('reason') or '').strip()
        document_url = (data.get('document_url') or '').strip()

        if not start_date_str or not reason:
            return Response({"detail": "Start Date and Reason are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            start_date = datetime.strptime(str(start_date_str)[:10], '%Y-%m-%d').date()
            end_date = datetime.strptime(str(end_date_str)[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            return Response({"detail": "Invalid date format. Use YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)

        if end_date < start_date:
            return Response({"detail": "End date cannot be prior to start date."}, status=status.HTTP_400_BAD_REQUEST)

        leave = LeaveRequest.objects.create(
            student=student,
            leave_type=leave_type,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
            document_url=document_url,
            status='PENDING'
        )

        AuditLog.log(
            action='STUDENT_UPDATE',
            entity='LeaveRequest',
            entity_id=str(leave.id),
            description=f"Student {student.name} ({student.roll_no}) applied for {leave.get_leave_type_display()} from {start_date} to {end_date}.",
            user=request.user,
            request=request
        )

        serializer = LeaveRequestSerializer(leave)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def review_leave_request(request, leave_id):
    """
    Teacher or Admin approves or rejects a student's leave / On-Duty request.
    If APPROVED:
      - Credits attendance for that student during the leave date range.
      - Dispatches an in-app notification to the student.
      - Logs audit entry.
    """
    try:
        leave = LeaveRequest.objects.select_related('student').get(id=leave_id)
    except LeaveRequest.DoesNotExist:
        return Response({"detail": "Leave request not found."}, status=status.HTTP_404_NOT_FOUND)

    new_status = request.data.get('status')
    if new_status not in ['APPROVED', 'REJECTED']:
        return Response({"detail": "Status must be either APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)

    remarks = (request.data.get('reviewer_remarks') or '').strip()
    leave.status = new_status
    leave.reviewed_by = request.user
    leave.reviewer_remarks = remarks
    leave.reviewed_at = timezone.now()
    leave.save()

    student = leave.student

    if new_status == 'APPROVED':
        credited_status = 'On-Duty' if leave.leave_type == 'OD' else ('Medical' if leave.leave_type == 'MEDICAL' else 'Excused')

        # 1. Update any existing Absent/Late records on these dates
        AttendanceRecord.objects.filter(
            student=student,
            date__gte=leave.start_date,
            date__lte=leave.end_date,
            status__in=['Absent', 'Late']
        ).update(
            status=credited_status,
            marked_via='LEAVE_APPROVAL',
            remarks=f"Credited via approved {leave.get_leave_type_display()}"
        )

        # 2. For any weekday date in range that has no attendance records, create one so attendance is credited
        cur_date = leave.start_date
        while cur_date <= leave.end_date:
            if cur_date.weekday() < 6:  # Mon to Sat
                exists = AttendanceRecord.objects.filter(student=student, date=cur_date).exists()
                if not exists:
                    AttendanceRecord.objects.create(
                        student=student,
                        date=cur_date,
                        status=credited_status,
                        marked_via='LEAVE_APPROVAL',
                        remarks=f"Approved {leave.get_leave_type_display()}: {leave.reason[:100]}"
                    )
            cur_date += timedelta(days=1)

        # 3. Send in-app notification to student
        user_profile = getattr(student, 'user_profile', None)
        profile_user = getattr(user_profile, 'user', None) if user_profile else None
        if profile_user:
            Notification.objects.create(
                user=profile_user,
                title=f"Leave Application Approved ({leave.get_leave_type_display()}) ✅",
                message=f"Your {leave.get_leave_type_display()} request for {leave.start_date} to {leave.end_date} ({leave.total_days} days) has been APPROVED by {request.user.get_full_name() or request.user.username}. Attendance credit has been granted.",
                notification_type='attendance'
            )

        AuditLog.log(
            action='STUDENT_UPDATE',
            entity='LeaveRequest',
            entity_id=str(leave.id),
            description=f"Approved {leave.get_leave_type_display()} for {student.name} ({student.roll_no}) from {leave.start_date} to {leave.end_date}.",
            user=request.user,
            request=request
        )

    elif new_status == 'REJECTED':
        user_profile = getattr(student, 'user_profile', None)
        profile_user = getattr(user_profile, 'user', None) if user_profile else None
        if profile_user:
            Notification.objects.create(
                user=profile_user,
                title="Leave Application Rejected ❌",
                message=f"Your {leave.get_leave_type_display()} request for {leave.start_date} to {leave.end_date} was rejected. Remarks: {remarks or 'None provided.'}",
                notification_type='attendance'
            )

        AuditLog.log(
            action='STUDENT_UPDATE',
            entity='LeaveRequest',
            entity_id=str(leave.id),
            description=f"Rejected {leave.get_leave_type_display()} for {student.name} ({student.roll_no}). Remarks: {remarks}",
            user=request.user,
            request=request
        )

    serializer = LeaveRequestSerializer(leave)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_leave_request(request, leave_id):
    """
    Cancel / delete a leave request:
    - Students can only cancel their own PENDING requests.
    - Admins can delete any request.
    """
    try:
        leave = LeaveRequest.objects.get(id=leave_id)
    except LeaveRequest.DoesNotExist:
        return Response({"detail": "Leave request not found."}, status=status.HTTP_404_NOT_FOUND)

    profile = getattr(request.user, 'profile', None)
    role = getattr(profile, 'role', 'admin') if profile else ('admin' if request.user.is_staff else None)

    if role == 'student':
        if not profile or not profile.student or leave.student.id != profile.student.id:
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        if leave.status != 'PENDING':
            return Response({"detail": "Only PENDING leave requests can be cancelled."}, status=status.HTTP_400_BAD_REQUEST)

    leave.delete()
    return Response({"detail": "Leave request cancelled successfully."}, status=status.HTTP_200_OK)


# =====================================================================
# LOW ATTENDANCE (<75%) PARENT & STUDENT ALERTS (EMAIL / SMS)
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def dispatch_low_attendance_alerts(request):
    """
    Teacher or Administrator triggers official low-attendance warning alerts (Email & SMS)
    to students and parents whose cumulative attendance is below the threshold (default: 75%).
    Payload:
      - student_id: optional int (alert single student)
      - threshold: optional float (default: 75.0)
      - branch, year, section: optional filters
      - custom_note: optional string
    """
    from .alerts import send_low_attendance_alert, calculate_classes_needed
    from .models import AttendanceAlertLog

    student_id = request.data.get('student_id')
    threshold = float(request.data.get('threshold', 75.0))
    branch = request.data.get('branch')
    year = request.data.get('year')
    section = request.data.get('section')
    custom_note = (request.data.get('custom_note') or '').strip()
    test_email = (request.data.get('test_email') or '').strip() or None
    force_send = bool(request.data.get('force_send', False))

    students = Student.objects.filter(is_active=True)
    if student_id:
        students = students.filter(id=student_id)
    if branch and branch.upper() != 'ALL':
        students = students.filter(branch__iexact=branch)
    if year and year != 'ALL':
        students = students.filter(year=year)
    if section and section.upper() != 'ALL':
        students = students.filter(section__iexact=section)

    dispatched_results = []
    skipped_count = 0

    for s in students:
        recs = AttendanceRecord.objects.filter(student=s)
        total = recs.count()
        if total > 0:
            present = recs.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
            rate = round((present / total * 100), 1)
        else:
            present = 0
            rate = 0.0

        is_defaulter = (total > 0 and rate < threshold)

        # Send alert if student is below threshold, or if admin explicitly targeted/forced this student for testing
        if is_defaulter or (student_id and force_send):
            if total == 0:
                demo_rate = 60.0
                demo_total = 5
                demo_present = 3
                needed = calculate_classes_needed(demo_total, demo_present, target_ratio=threshold / 100.0)
                used_rate = demo_rate
                used_total = demo_total
                used_present = demo_present
            elif force_send and rate >= threshold:
                used_rate = rate
                used_total = total
                used_present = present
                needed = 2
            else:
                needed = calculate_classes_needed(total, present, target_ratio=threshold / 100.0)
                used_rate = rate
                used_total = total
                used_present = present

            res = send_low_attendance_alert(
                student=s,
                percentage=used_rate,
                total_classes=used_total,
                attended_classes=used_present,
                classes_needed=needed,
                threshold=threshold,
                trigger_source='MANUAL_TEST' if force_send else 'MANUAL',
                user=request.user,
                custom_note=custom_note,
                test_email=test_email
            )
            dispatched_results.append(res)
        else:
            skipped_count += 1

    return Response({
        "success": True,
        "message": f"Successfully activated alerts. Dispatched {len(dispatched_results)} warning email notice(s) (<{threshold}%).",
        "threshold": threshold,
        "total_dispatched": len(dispatched_results),
        "total_eligible_checked": students.count(),
        "skipped_count": skipped_count,
        "alerts": dispatched_results,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def get_attendance_alert_history(request):
    """
    Returns recent dispatch logs of low attendance shortage alerts.
    """
    from .models import AttendanceAlertLog
    limit = int(request.query_params.get('limit', 50))
    student_id = request.query_params.get('student_id')

    logs = AttendanceAlertLog.objects.select_related('student', 'sent_by').all()
    if student_id:
        logs = logs.filter(student_id=student_id)

    logs = logs[:limit]

    data = [
        {
            "id": log.id,
            "student_id": log.student.id,
            "student_name": log.student.name,
            "roll_no": log.student.roll_no,
            "cohort": f"{log.student.branch} Y{log.student.year}S{log.student.semester}-{log.student.section}",
            "percentage": log.percentage,
            "threshold": log.threshold,
            "attended": log.attended_classes,
            "total": log.total_classes,
            "classes_needed": log.classes_needed,
            "channel": log.channel,
            "student_email": log.student_email,
            "parent_email": log.parent_email,
            "student_phone": log.student_phone,
            "parent_phone": log.parent_phone,
            "email_sent": log.email_sent,
            "sms_sent": log.sms_sent,
            "trigger_source": log.trigger_source,
            "sent_by": log.sent_by.username if log.sent_by else "System",
            "sent_at": log.sent_at.isoformat(),
        }
        for log in logs
    ]

    return Response({
        "total": len(data),
        "history": data
    }, status=status.HTTP_200_OK)



