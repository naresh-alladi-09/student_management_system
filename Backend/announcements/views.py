from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q

from accounts.permissions import IsTeacherOrAdmin
from .models import Announcement
from .serializers import AnnouncementSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_announcements(request):
    """
    List active, non-expired announcements.
    Filters by department if applicable.
    """
    user = request.user
    profile = getattr(user, 'profile', None)

    now = timezone.now()
    qs = Announcement.objects.filter(is_active=True).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now)
    )

    dept = request.query_params.get('department', None)
    if dept and dept.upper() != 'ALL':
        qs = qs.filter(Q(department__iexact=dept) | Q(department__iexact='All'))
    elif profile and profile.role == 'student' and profile.student:
        stu_branch = profile.student.branch
        qs = qs.filter(Q(department__iexact=stu_branch) | Q(department__iexact='All') | Q(department__icontains=stu_branch))

    serializer = AnnouncementSerializer(qs, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def create_announcement(request):
    """
    Teacher or Admin publishes an announcement.
    """
    serializer = AnnouncementSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
