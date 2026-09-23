from datetime import datetime, date
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.conf import settings

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
    """
    user = request.user
    profile = getattr(user, 'profile', None)
    
    # Allow overriding day for testing e.g. ?day=Monday
    query_day = request.query_params.get('day')
    today_day = query_day if query_day else datetime.now().strftime('%A')

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
    data = serializer.data

    # Check for active attendance sessions today for each slot
    today_date = date.today()
    for item in data:
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
        else:
            item['has_active_session'] = False
            item['active_session_id'] = None
            item['active_token'] = None
            item['active_expires_at'] = None

    return Response({
        'day': today_day,
        'count': len(data),
        'slots': data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def start_attendance_from_slot(request, slot_id):
    """
    Instantly spawn a secure QR AttendanceSession inheriting all metadata
    from a scheduled TimetableSlot without manual re-entry.
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

    try:
        duration_seconds = int(request.data.get('duration_seconds', 120))
    except (TypeError, ValueError):
        duration_seconds = 120

    # Create secure AttendanceSession inheriting timetable attributes
    session = AttendanceSession.create_session(
        subject=slot.subject,
        teacher=slot.teacher,
        duration_seconds=duration_seconds,
        academic_class=slot.academic_class,
        section=slot.section or 'A'
    )

    # Log action to AuditLog
    AuditLog.log(
        action="ATTENDANCE_SESSION_START",
        entity="AttendanceSession",
        entity_id=session.id,
        description=(
            f"Started QR session #{session.id} for scheduled slot #{slot.id} "
            f"({slot.subject.code} - {slot.room} - Section {slot.section})"
        ),
        request=request
    )

    frontend_base = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
    qr_payload = f"{frontend_base}/mark-attendance?token={session.qr_token}"

    return Response({
        'session_id': session.id,
        'token': session.qr_token,
        'expires_at': session.expires_at,
        'duration_seconds': session.duration_seconds,
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
        'message': f"Live attendance session activated for {slot.subject.code} ({slot.room})."
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

