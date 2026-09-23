import time
from rest_framework import viewsets, status, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.db import connection
from django.db.models import Q, Count
from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsAdmin
from audit.models import AuditLog
from .models import Department, Branch, AcademicClass, FacultyAssignment, Student
from .serializers import (
    DepartmentSerializer,
    BranchSerializer,
    AcademicClassSerializer,
    FacultyAssignmentSerializer,
    StudentSerializer,
)


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
        queryset = Student.objects.all().select_related('academic_class', 'academic_class__branch').order_by('-id')

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

        # Filter by section
        section_param = self.request.query_params.get('section', None)
        if section_param and section_param.upper() != 'ALL':
            queryset = queryset.filter(section__iexact=section_param)

        # Filter by academic_class id
        academic_class_id = self.request.query_params.get('academic_class', None)
        if academic_class_id:
            queryset = queryset.filter(academic_class_id=academic_class_id)

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

    def perform_create(self, serializer):
        student = serializer.save()
        AuditLog.log(
            action='STUDENT_CREATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"Student '{student.name}' ({student.roll_no}) enrolled into {student.branch} Year {student.year} Sec {student.section}.",
            user=self.request.user,
            request=self.request
        )

    def perform_update(self, serializer):
        student = serializer.save()
        AuditLog.log(
            action='STUDENT_UPDATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"Student '{student.name}' ({student.roll_no}) record updated.",
            user=self.request.user,
            request=self.request
        )

    def perform_destroy(self, instance):
        # Soft delete instead of hard delete to preserve historical records
        instance.deactivate()
        AuditLog.log(
            action='STUDENT_DEACTIVATE',
            entity='Student',
            entity_id=str(instance.id),
            description=f"Student '{instance.name}' ({instance.roll_no}) deactivated via deletion request.",
            user=self.request.user,
            request=self.request
        )

    @action(detail=True, methods=['post'], permission_classes=[IsTeacherOrAdmin])
    def deactivate(self, request, pk=None):
        student = self.get_object()
        student.deactivate()
        AuditLog.log(
            action='STUDENT_DEACTIVATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"Student '{student.name}' ({student.roll_no}) deactivated.",
            user=request.user,
            request=request
        )
        return Response({
            "detail": f"Student '{student.name}' ({student.roll_no}) deactivated successfully.",
            "is_active": False
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsTeacherOrAdmin])
    def activate(self, request, pk=None):
        student = self.get_object()
        student.activate()
        AuditLog.log(
            action='STUDENT_ACTIVATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"Student '{student.name}' ({student.roll_no}) restored successfully.",
            user=request.user,
            request=request
        )
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


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]


class BranchViewSet(viewsets.ModelViewSet):
    queryset = Branch.objects.all().select_related('department')
    serializer_class = BranchSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]


class AcademicClassViewSet(viewsets.ModelViewSet):
    queryset = AcademicClass.objects.all().select_related('branch', 'branch__department')
    serializer_class = AcademicClassSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        branch = self.request.query_params.get('branch', None)
        year = self.request.query_params.get('year', None)
        semester = self.request.query_params.get('semester', None)
        section = self.request.query_params.get('section', None)
        if branch and branch.upper() != 'ALL':
            qs = qs.filter(branch__code__iexact=branch)
        if year:
            qs = qs.filter(year=year)
        if semester:
            qs = qs.filter(semester=semester)
        if section:
            qs = qs.filter(section__iexact=section)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        AuditLog.log(
            action='ACADEMIC_SETUP',
            entity='AcademicClass',
            entity_id=str(obj.id),
            description=f"Created cohort {obj.display_name}.",
            user=self.request.user,
            request=self.request
        )

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]


class FacultyAssignmentViewSet(viewsets.ModelViewSet):
    queryset = FacultyAssignment.objects.all().select_related(
        'teacher', 'subject', 'academic_class', 'academic_class__branch'
    )
    serializer_class = FacultyAssignmentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        teacher_id = self.request.query_params.get('teacher_id', None)
        subject_id = self.request.query_params.get('subject_id', None)
        class_id = self.request.query_params.get('class_id', None)
        if teacher_id:
            qs = qs.filter(teacher_id=teacher_id)
        if subject_id:
            qs = qs.filter(subject_id=subject_id)
        if class_id:
            qs = qs.filter(academic_class_id=class_id)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        AuditLog.log(
            action='ACADEMIC_SETUP',
            entity='FacultyAssignment',
            entity_id=str(obj.id),
            description=f"Assigned faculty '{obj.teacher.username}' to subject '{obj.subject.code}' in cohort '{obj.academic_class.display_name}'.",
            user=self.request.user,
            request=self.request
        )

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]