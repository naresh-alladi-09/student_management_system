from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q

from accounts.permissions import IsTeacherOrAdmin
from audit.models import AuditLog
from notifications.models import Notification
from students.models import Student
from .models import Announcement
from .serializers import AnnouncementSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_announcements(request):
    """
    List active, non-expired announcements.
    If the user is a student, only returns announcements targeted to their cohort/branch/year/section or all.
    """
    user = request.user
    profile = getattr(user, 'profile', None)

    now = timezone.now()
    qs = Announcement.objects.filter(is_active=True).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now)
    ).select_related('created_by', 'academic_class')

    if profile and profile.role == 'student' and profile.student:
        stu = profile.student
        student_filter = Q(target_audience='ALL')

        # Branch match
        if stu.branch:
            student_filter |= Q(target_audience='BRANCH', branch__iexact=stu.branch)

        # Year match
        if stu.year:
            y_filter = Q(target_audience='YEAR', year=stu.year)
            if stu.branch:
                y_filter &= (Q(branch__iexact=stu.branch) | Q(branch=''))
            student_filter |= y_filter

        # Semester match
        if stu.semester:
            s_filter = Q(target_audience='SEMESTER', semester=str(stu.semester))
            if stu.branch:
                s_filter &= (Q(branch__iexact=stu.branch) | Q(branch=''))
            student_filter |= s_filter

        # Section match
        if stu.section:
            sec_filter = Q(target_audience='SECTION', section__iexact=stu.section)
            if stu.branch:
                sec_filter &= (Q(branch__iexact=stu.branch) | Q(branch=''))
            student_filter |= sec_filter

        # Specific Class cohort match
        if stu.academic_class:
            student_filter |= Q(target_audience='CLASS', academic_class=stu.academic_class)

        # Legacy announcements with blank/default target_audience
        legacy_q = Q(target_audience__isnull=True) | Q(target_audience='')
        if stu.branch:
            legacy_q &= (Q(department__iexact='All') | Q(department__iexact=stu.branch))
        else:
            legacy_q &= Q(department__iexact='All')
        student_filter |= legacy_q

        qs = qs.filter(student_filter)
    else:
        # Teachers and Admins can also filter
        dept = request.query_params.get('department', None)
        branch = request.query_params.get('branch', None)
        priority = request.query_params.get('priority', None)
        audience = request.query_params.get('target_audience', None)

        if dept and dept.upper() != 'ALL':
            qs = qs.filter(Q(department__iexact=dept) | Q(department__iexact='All'))
        if branch and branch.upper() != 'ALL':
            qs = qs.filter(branch__iexact=branch)
        if priority and priority.upper() != 'ALL':
            qs = qs.filter(priority__iexact=priority)
        if audience and audience.upper() != 'ALL':
            qs = qs.filter(target_audience__iexact=audience)

    serializer = AnnouncementSerializer(qs, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def create_announcement(request):
    """
    Teacher or Admin publishes an announcement.
    Automatically generates in-app notifications for targeted students and logs to AuditLog.
    """
    serializer = AnnouncementSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    ann = serializer.save(created_by=request.user)

    # 1. Audit Log
    AuditLog.log(
        action="ANNOUNCEMENT_CREATE",
        entity="Announcement",
        entity_id=ann.id,
        description=f"Published: '{ann.title}' (Audience: {ann.target_audience}, Priority: {ann.priority})",
        request=request
    )

    # 2. Targeted In-App Notifications
    try:
        students_qs = Student.objects.filter(is_active=True).select_related('user_profile__user')

        if ann.target_audience == 'BRANCH' and ann.branch:
            students_qs = students_qs.filter(branch__iexact=ann.branch)
        elif ann.target_audience == 'YEAR' and ann.year:
            students_qs = students_qs.filter(year=ann.year)
            if ann.branch:
                students_qs = students_qs.filter(branch__iexact=ann.branch)
        elif ann.target_audience == 'SEMESTER' and ann.semester:
            students_qs = students_qs.filter(semester=str(ann.semester))
            if ann.branch:
                students_qs = students_qs.filter(branch__iexact=ann.branch)
        elif ann.target_audience == 'SECTION' and ann.section:
            students_qs = students_qs.filter(section__iexact=ann.section)
            if ann.branch:
                students_qs = students_qs.filter(branch__iexact=ann.branch)
        elif ann.target_audience == 'CLASS' and ann.academic_class:
            students_qs = students_qs.filter(academic_class=ann.academic_class)
        elif ann.department and ann.department.upper() != 'ALL':
            students_qs = students_qs.filter(branch__iexact=ann.department)

        notifications_to_create = []
        for s in students_qs:
            if hasattr(s, 'user_profile') and s.user_profile and s.user_profile.user:
                notifications_to_create.append(
                    Notification(
                        user=s.user_profile.user,
                        title=f"Announcement: {ann.title}",
                        message=ann.description[:250],
                        notification_type='announcement'
                    )
                )

        if notifications_to_create:
            Notification.objects.bulk_create(notifications_to_create[:500])
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Could not bulk create notifications for announcement {ann.id}: {e}")

    return Response(AnnouncementSerializer(ann).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsTeacherOrAdmin])
def manage_announcement(request, pk):
    """
    Retrieve, update or deactivate an announcement.
    """
    try:
        ann = Announcement.objects.get(pk=pk)
    except Announcement.DoesNotExist:
        return Response({"detail": "Announcement not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(AnnouncementSerializer(ann).data, status=status.HTTP_200_OK)

    elif request.method == 'PUT':
        serializer = AnnouncementSerializer(ann, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            AuditLog.log(
                action="ANNOUNCEMENT_UPDATE",
                entity="Announcement",
                entity_id=ann.id,
                description=f"Updated announcement '{ann.title}'",
                request=request
            )
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        ann.is_active = False
        ann.save(update_fields=['is_active'])
        AuditLog.log(
            action="ANNOUNCEMENT_DELETE",
            entity="Announcement",
            entity_id=ann.id,
            description=f"Deactivated announcement '{ann.title}'",
            request=request
        )
        return Response({"message": "Announcement deactivated successfully."}, status=status.HTTP_200_OK)
