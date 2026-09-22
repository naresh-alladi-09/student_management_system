from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsTeacherOrAdmin
from .models import TimetableSlot
from .serializers import TimetableSlotSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_timetable(request):
    """
    List timetable slots.
    If student: auto-filters by student's branch & semester.
    If teacher/admin: supports ?branch=CSE&semester=1 or ?teacher=true
    """
    user = request.user
    profile = getattr(user, 'profile', None)

    slots = TimetableSlot.objects.all().select_related('subject', 'teacher')

    if profile and profile.role == 'student' and profile.student:
        stu = profile.student
        slots = slots.filter(branch__iexact=stu.branch, semester=stu.semester)
    else:
        branch = request.query_params.get('branch', None)
        sem = request.query_params.get('semester', None)
        my_schedule = request.query_params.get('my', None)

        if my_schedule in ['true', '1']:
            slots = slots.filter(teacher=user)
        if branch and branch.upper() != 'ALL':
            slots = slots.filter(branch__iexact=branch)
        if sem:
            slots = slots.filter(semester=sem)

    serializer = TimetableSlotSerializer(slots, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


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
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
