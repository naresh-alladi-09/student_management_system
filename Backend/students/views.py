import time
from rest_framework import viewsets, status, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.db import connection
from django.db.models import Q, Count
from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsAdmin
from .models import Student
from .serializers import StudentSerializer


class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer

    def get_permissions(self):
        if self.action in ['retrieve']:
            # Student can view their own record; teachers/admins can view any
            return [IsAuthenticated(), IsSelfOrStaff()]
        elif self.action in ['destroy']:
            # Admins or teachers can deactivate
            return [IsAuthenticated(), IsTeacherOrAdmin()]
        else:
            # list, create, update, partial_update
            return [IsAuthenticated(), IsTeacherOrAdmin()]

    def get_queryset(self):
        queryset = Student.objects.all().order_by('-id')

        # Filter by active status (default: show active unless requested otherwise)
        active_param = self.request.query_params.get('is_active', None)
        if active_param is not None:
            if active_param.lower() in ['true', '1']:
                queryset = queryset.filter(is_active=True)
            elif active_param.lower() in ['false', '0']:
                queryset = queryset.filter(is_active=False)

        # Filter by branch
        branch_param = self.request.query_params.get('branch', None)
        if branch_param and branch_param.upper() != 'ALL':
            queryset = queryset.filter(branch__iexact=branch_param)

        # Filter by year
        year_param = self.request.query_params.get('year', None)
        if year_param:
            queryset = queryset.filter(year=year_param)

        # Filter by semester
        semester_param = self.request.query_params.get('semester', None)
        if semester_param:
            queryset = queryset.filter(semester=semester_param)

        # Search by keyword
        search = self.request.query_params.get('search', None)
        if search:
            s = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=s) |
                Q(roll_no__icontains=s) |
                Q(student_id__icontains=s) |
                Q(email__icontains=s) |
                Q(phone__icontains=s)
            )

        return queryset

    def list(self, request, *args, **kwargs):
        # Support optional unpaginated response when ?all=true
        if request.query_params.get('all', '').lower() in ['true', '1']:
            queryset = self.filter_queryset(self.get_queryset())
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return super().list(request, *args, **kwargs)

    def perform_destroy(self, instance):
        # Soft delete instead of hard delete to preserve historical records
        instance.deactivate()

    @action(detail=True, methods=['post'], permission_classes=[IsTeacherOrAdmin])
    def deactivate(self, request, pk=None):
        student = self.get_object()
        student.deactivate()
        return Response({
            "detail": f"Student '{student.name}' ({student.roll_no}) deactivated successfully.",
            "is_active": False
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacherOrAdmin])
    def activate(self, request, pk=None):
        student = self.get_object()
        student.activate()
        return Response({
            "detail": f"Student '{student.name}' ({student.roll_no}) restored successfully.",
            "is_active": True
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsTeacherOrAdmin])
    def stats(self, request):
        total = Student.objects.count()
        active = Student.objects.filter(is_active=True).count()
        inactive = total - active
        by_branch = list(
            Student.objects.filter(is_active=True)
            .values('branch')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        return Response({
            "total": total,
            "active": active,
            "inactive": inactive,
            "by_branch": by_branch,
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Health check endpoint to verify backend and database connectivity.
    """
    start_time = time.time()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        latency_ms = round((time.time() - start_time) * 1000, 2)
        student_count = Student.objects.count()
        return Response({
            "status": "healthy",
            "database": "connected",
            "database_vendor": connection.vendor,
            "latency_ms": latency_ms,
            "total_students": student_count,
            "message": "Connected to database successfully without errors."
        }, status=status.HTTP_200_OK)
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 2)
        return Response({
            "status": "unhealthy",
            "database": "disconnected",
            "latency_ms": latency_ms,
            "error": str(e)
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)