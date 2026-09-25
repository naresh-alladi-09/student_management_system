from datetime import datetime, date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.utils import timezone

from accounts.permissions import IsTeacherOrAdmin, IsAdmin
from audit.models import AuditLog
from attendance.models import AttendanceSession
from .models import TimetableSlot
from .serializers import TimetableSlotSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_timetable(request):
    """
    List timetable slots.
    If student: auto-filters by student's branch & semester & section.
    If teacher/admin: supports ?branch=CSE&year=3&semester=5&section=A&day=Monday or ?my=true
    """
    user = request.user
    profile = getattr(user, 'profile', None)

    slots = TimetableSlot.objects.all().select_related('subject', 'teacher', 'academic_class')

    if profile and profile.role == 'student' and profile.student:
        stu = profile.student
        slots = slots.filter(branch__iexact=stu.branch, semester=str(stu.semester))
        if stu.section:
            # Match section or slots without section restrictions
            slots = slots.filter(section__in=[stu.section, '', 'All'])
    else:
        branch = request.query_params.get('branch', None)
        year = request.query_params.get('year', None)
        sem = request.query_params.get('semester', None)
        section = request.query_params.get('section', None)
        day = request.query_params.get('day', None)
        teacher_id = request.query_params.get('teacher_id', None)
        my_schedule = request.query_params.get('my', None)

        if my_schedule in ['true', '1']:
            slots = slots.filter(teacher=user)
        elif teacher_id:
            slots = slots.filter(teacher_id=teacher_id)

        if branch and branch.upper() != 'ALL':
            slots = slots.filter(branch__iexact=branch)
        if year:
            slots = slots.filter(year=year)
        if sem:
            slots = slots.filter(semester=str(sem))
        if section and section.upper() != 'ALL':
            slots = slots.filter(section__iexact=section)
        if day and day.upper() != 'ALL':
            slots = slots.filter(day__iexact=day)

    serializer = TimetableSlotSerializer(slots, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_today_timetable(request):
    """
    Get today's scheduled classes.
    For student: today's lectures for their cohort.
    For teacher: today's assigned teaching lectures with active QR session metadata.

    Automatic Vanishing:
    Morning periods automatically disappear after their end time (in the afternoon).
    Afternoon periods automatically disappear after their end time (in the evening).
    Only currently active and upcoming periods remain visible by default.
    """
    user = request.user
    profile = getattr(user, 'profile', None)
    
    now_local = timezone.localtime()
    current_time = now_local.time()
    today_date = now_local.date()
    today_day_actual = now_local.strftime('%A')

    # Allow overriding day for testing e.g. ?day=Monday
    query_day = request.query_params.get('day')
    today_day = query_day if query_day else today_day_actual
    is_today = (today_day.lower() == today_day_actual.lower())
    show_all = request.query_params.get('all', '').lower() in ['true', '1']

    # Auto-expire any active attendance sessions today whose expires_at or end_time has passed
    AttendanceSession.objects.filter(
        date=today_date,
        is_active=True,
        expires_at__lt=now_local
    ).update(is_active=False)

    slots = TimetableSlot.objects.filter(day__iexact=today_day).select_related(
        'subject', 'teacher', 'academic_class'
    )

    if profile and profile.role == 'student' and profile.student:
        stu = profile.student
        slots = slots.filter(branch__iexact=stu.branch, semester=str(stu.semester))
        if stu.section:
            slots = slots.filter(section__in=[stu.section, '', 'All'])
    elif profile and profile.role == 'teacher':
        slots = slots.filter(teacher=user)
    else:
        # Admin can view all or filter by teacher
        teacher_id = request.query_params.get('teacher_id')
        if teacher_id:
            slots = slots.filter(teacher_id=teacher_id)

    serializer = TimetableSlotSerializer(slots, many=True)
    raw_data = serializer.data

    total_slots_count = len(raw_data)
    filtered_slots = []
    completed_slots_count = 0

    for item in raw_data:
        start_t_str = item.get('start_time', '00:00:00')
        end_t_str = item.get('end_time', '23:59:59')
        try:
            start_t = datetime.strptime(start_t_str[:8], '%H:%M:%S').time()
            end_t = datetime.strptime(end_t_str[:8], '%H:%M:%S').time()
        except Exception:
            start_t = datetime.strptime(start_t_str[:5], '%H:%M').time()
            end_t = datetime.strptime(end_t_str[:5], '%H:%M').time()

        if is_today:
            if end_t <= current_time:
                item['status'] = 'completed'
                item['can_open_qr'] = False
                item['is_current_slot'] = False
                item['time_status_label'] = f"Completed at {end_t.strftime('%I:%M %p')}"
                completed_slots_count += 1
            elif start_t <= current_time < end_t:
                item['status'] = 'active'
                item['can_open_qr'] = True
                item['is_current_slot'] = True
                rem_sec = int((datetime.combine(today_date, end_t) - datetime.combine(today_date, current_time)).total_seconds())
                item['remaining_seconds'] = max(0, rem_sec)
                item['time_status_label'] = f"Active Now (Closes at {end_t.strftime('%I:%M %p')})"
            else:
                item['status'] = 'upcoming'
                item['can_open_qr'] = False
                item['is_current_slot'] = False
                starts_in = int((datetime.combine(today_date, start_t) - datetime.combine(today_date, current_time)).total_seconds())
                item['starts_in_seconds'] = max(0, starts_in)
                item['time_status_label'] = f"Upcoming (Starts at {start_t.strftime('%I:%M %p')})"
        else:
            item['status'] = 'scheduled'
            item['can_open_qr'] = False
            item['is_current_slot'] = False
            item['time_status_label'] = f"{item.get('day')} {start_t.strftime('%I:%M %p')} - {end_t.strftime('%I:%M %p')}"

        # Check for active attendance sessions today for each slot
        active_session = AttendanceSession.objects.filter(
            subject_id=item['subject'],
            teacher_id=item['teacher'],
            date=today_date,
            is_active=True
        ).first()

        if active_session and not active_session.is_expired():
            item['has_active_session'] = True
            item['active_session_id'] = active_session.id
            item['active_token'] = active_session.qr_token
            item['active_expires_at'] = active_session.expires_at
            item['duration_seconds'] = max(1, int((active_session.expires_at - now_local).total_seconds()))
        else:
            item['has_active_session'] = False
            item['active_session_id'] = None
            item['active_token'] = None
            item['active_expires_at'] = None

        # Vanishing logic:
        # If it is today and show_all is false, completed periods disappear / vanish!
        # Morning periods vanish in the afternoon, afternoon periods vanish in the evening.
        if is_today and not show_all and item['status'] == 'completed':
            continue

        filtered_slots.append(item)

    return Response({
        'day': today_day,
        'count': len(filtered_slots),
        'total_count': total_slots_count,
        'completed_count': completed_slots_count,
        'slots': filtered_slots
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def start_attendance_from_slot(request, slot_id):
    """
    Instantly spawn a secure QR AttendanceSession inheriting all metadata
    from a scheduled TimetableSlot.
    Attendance can ONLY be opened between start_time and end_time,
    and automatically expires and closes at slot.end_time.
    """
    slot = get_object_or_404(
        TimetableSlot.objects.select_related('subject', 'teacher', 'academic_class'),
        pk=slot_id
    )

    # Permission check: must be assigned teacher or staff/admin
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin and slot.teacher != request.user:
        return Response(
            {'detail': 'You can only start attendance for lectures assigned to you.'},
            status=status.HTTP_403_FORBIDDEN
        )

    now_local = timezone.localtime()
    current_time = now_local.time()
    today_date = now_local.date()
    today_day_actual = now_local.strftime('%A')

    ignore_day = request.data.get('ignore_day', False)
    ignore_time = request.data.get('ignore_time', False)

    # Validate day of week
    if slot.day.lower() != today_day_actual.lower() and not ignore_day:
        return Response(
            {'detail': f"This lecture slot is scheduled for {slot.day}, not today ({today_day_actual})."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate start_time and end_time
    start_str = slot.start_time.strftime('%I:%M %p')
    end_str = slot.end_time.strftime('%I:%M %p')

    if current_time < slot.start_time and not ignore_time:
        return Response(
            {'detail': f"This lecture period is scheduled from {start_str} to {end_str}. QR attendance can only be opened when the period starts at {start_str}."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if current_time >= slot.end_time and not ignore_time:
        return Response(
            {'detail': f"This lecture period concluded at {end_str}. The period has ended and QR attendance is closed."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Expiration is strictly set to slot.end_time today
    slot_end_dt = timezone.make_aware(datetime.combine(today_date, slot.end_time))
    remaining_seconds = int((slot_end_dt - now_local).total_seconds())
    if remaining_seconds <= 0 and not ignore_time:
        return Response(
            {'detail': f"This lecture period ended at {end_str}."},
            status=status.HTTP_400_BAD_REQUEST
        )

    duration_seconds = max(1, remaining_seconds) if not ignore_time else int(request.data.get('duration_seconds', 120))
    expires_at = slot_end_dt if not ignore_time else (now_local + timezone.timedelta(seconds=duration_seconds))

    # Check for active existing session for this slot today to prevent duplicates
    active_session = AttendanceSession.objects.filter(
        subject=slot.subject,
        teacher=slot.teacher,
        date=today_date,
        is_active=True
    ).first()

    if active_session:
        if not active_session.is_expired():
            session = active_session
            session.expires_at = expires_at
            session.end_time = slot.end_time
            session.duration_seconds = duration_seconds
            session.save(update_fields=['expires_at', 'end_time', 'duration_seconds'])
        else:
            active_session.is_active = False
            active_session.save(update_fields=['is_active'])
            session = None
    else:
        session = None

    if not session:
        session = AttendanceSession.create_session(
            subject=slot.subject,
            teacher=slot.teacher,
            duration_seconds=duration_seconds,
            academic_class=slot.academic_class,
            section=slot.section or 'A',
            expires_at=expires_at,
            end_time=slot.end_time
        )

    # Log action to AuditLog
    AuditLog.log(
        action="ATTENDANCE_SESSION_START",
        entity="AttendanceSession",
        entity_id=session.id,
        description=(
            f"Started QR session #{session.id} for scheduled slot #{slot.id} "
            f"({slot.subject.code} - {slot.room} - Section {slot.section}) until {end_str}"
        ),
        request=request
    )

    frontend_base = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    qr_payload = f"{frontend_base}/mark-attendance?token={session.qr_token}"

    return Response({
        'session_id': session.id,
        'token': session.qr_token,
        'expires_at': session.expires_at,
        'duration_seconds': duration_seconds,
        'subject_id': slot.subject.id,
        'subject_name': slot.subject.name,
        'subject_code': slot.subject.code,
        'room': slot.room,
        'branch': slot.branch,
        'year': slot.year,
        'semester': slot.semester,
        'section': slot.section,
        'academic_class_name': str(slot.academic_class) if slot.academic_class else f"{slot.branch} Y{slot.year}S{slot.semester}-{slot.section}",
        'start_time': slot.start_time.strftime('%H:%M'),
        'end_time': slot.end_time.strftime('%H:%M'),
        'day': slot.day,
        'qr_value': qr_payload,
        'message': f"Live attendance session activated for {slot.subject.code} ({slot.room}). Session will close automatically at {end_str}."
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def create_timetable_slot(request):
    """
    Admin or Teacher creates a timetable schedule slot.
    """
    data = request.data.copy()
    if 'teacher' not in data or not data['teacher']:
        data['teacher'] = request.user.id

    serializer = TimetableSlotSerializer(data=data)
    if serializer.is_valid():
        slot = serializer.save()
        AuditLog.log(
            action="TIMETABLE_CREATE",
            entity="TimetableSlot",
            entity_id=slot.id,
            description=f"Created timetable slot #{slot.id}: {slot.day} {slot.start_time}-{slot.end_time} ({slot.subject.code})",
            request=request
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsTeacherOrAdmin])
def manage_timetable_slot(request, slot_id):
    """
    Retrieve, update or delete a timetable slot.
    """
    slot = get_object_or_404(TimetableSlot, pk=slot_id)

    # Teachers can only edit/delete their own slots, admins can manage all
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin and slot.teacher != request.user:
        return Response(
            {'detail': 'You do not have permission to modify this timetable slot.'},
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == 'GET':
        serializer = TimetableSlotSerializer(slot)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = TimetableSlotSerializer(slot, data=request.data, partial=partial)
        if serializer.is_valid():
            updated_slot = serializer.save()
            AuditLog.log(
                action="TIMETABLE_UPDATE",
                entity="TimetableSlot",
                entity_id=updated_slot.id,
                description=f"Updated timetable slot #{updated_slot.id}: {updated_slot.day} {updated_slot.subject.code}",
                request=request
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'DELETE':
        slot_desc = f"Slot #{slot.id} ({slot.day} {slot.subject.code} {slot.room})"
        slot.delete()
        AuditLog.log(
            action="TIMETABLE_DELETE",
            entity="TimetableSlot",
            entity_id=slot.id,
            description=f"Deleted {slot_desc}",
            request=request
        )
        return Response({'detail': f"{slot_desc} deleted successfully."}, status=status.HTTP_200_OK)

