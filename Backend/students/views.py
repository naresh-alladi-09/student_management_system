import json
import time
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.db import connection
from django.db.models import Q, Count
from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsAdmin
from audit.models import AuditLog
from attendance.face_geo_service import extract_face_embedding
from .models import Department, Branch, AcademicClass, FacultyAssignment, Student
from .serializers import (
    DepartmentSerializer,
    BranchSerializer,
    AcademicClassSerializer,
    FacultyAssignmentSerializer,
    StudentSerializer,
)


from rest_framework.exceptions import PermissionDenied


class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer

    def get_permissions(self):
        if self.action in ['retrieve']:
            # Student can only view their own record; teachers and admins view authorized students
            return [IsAuthenticated(), IsSelfOrStaff()]
        elif self.action in ['destroy', 'deactivate', 'activate']:
            # Deleting or changing student lifecycle status requires Admin privileges
            return [IsAuthenticated(), IsAdmin()]
        elif self.action in ['create', 'update', 'partial_update', 'stats', 'register_face', 'detect_face']:
            # Permitted teachers or admins can enroll students and register their faces
            return [IsAuthenticated(), IsTeacherOrAdmin()]
        else:
            return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Student.objects.none()

        profile = getattr(user, 'profile', None)
        role = profile.role if profile else ('admin' if (user.is_superuser or user.is_staff) else 'student')

        # 1. Base Queryset by Role
        if user.is_superuser or user.is_staff or role == 'admin':
            queryset = Student.objects.all().select_related('academic_class', 'academic_class__branch').order_by('-id')
        elif role == 'teacher':
            assigned_class_ids = FacultyAssignment.objects.filter(teacher=user).values_list('academic_class_id', flat=True).distinct()
            if assigned_class_ids.exists():
                queryset = Student.objects.filter(academic_class_id__in=assigned_class_ids).select_related('academic_class', 'academic_class__branch').order_by('-id')
            elif profile and profile.department:
                queryset = Student.objects.filter(
                    Q(department__iexact=profile.department) |
                    Q(academic_class__branch__department__name__iexact=profile.department)
                ).select_related('academic_class', 'academic_class__branch').order_by('-id')
            else:
                queryset = Student.objects.none()
        elif role == 'student':
            if profile and profile.student:
                # Student can ONLY ever access their own profile
                queryset = Student.objects.filter(id=profile.student.id).select_related('academic_class', 'academic_class__branch')
            else:
                queryset = Student.objects.none()
        else:
            queryset = Student.objects.none()

        # 2. Query Parameter Filters
        active_param = self.request.query_params.get('is_active', None)
        if active_param is not None:
            if active_param.lower() in ['true', '1']:
                queryset = queryset.filter(is_active=True)
            elif active_param.lower() in ['false', '0']:
                queryset = queryset.filter(is_active=False)

        branch_param = self.request.query_params.get('branch', None)
        if branch_param and branch_param.upper() != 'ALL':
            queryset = queryset.filter(branch__iexact=branch_param)

        year_param = self.request.query_params.get('year', None)
        if year_param:
            queryset = queryset.filter(year=year_param)

        semester_param = self.request.query_params.get('semester', None)
        if semester_param:
            queryset = queryset.filter(semester=semester_param)

        section_param = self.request.query_params.get('section', None)
        if section_param and section_param.upper() != 'ALL':
            queryset = queryset.filter(section__iexact=section_param)

        academic_class_id = self.request.query_params.get('academic_class', None)
        if academic_class_id:
            queryset = queryset.filter(academic_class_id=academic_class_id)

        # Keyword search
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
        if request.query_params.get('all', '').lower() in ['true', '1']:
            queryset = self.filter_queryset(self.get_queryset())
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        student = serializer.save()

        # If a face photo was provided upon registration, extract biometric embedding
        if student.profile_photo:
            try:
                ok, embedding, details = extract_face_embedding(student.profile_photo)
                if ok and embedding:
                    student.face_embedding = json.dumps(embedding)
                    student.face_registered = True
                    student.face_registered_at = timezone.now()
                    student.save(update_fields=['face_embedding', 'face_registered', 'face_registered_at'])
            except Exception as e:
                print(f"[StudentViewSet] Biometric enrollment note: {e}")

        actor = "Faculty" if (hasattr(self.request.user, 'profile') and self.request.user.profile.role == 'teacher') else "Admin"
        AuditLog.log(
            action='STUDENT_CREATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"{actor} '{self.request.user.username}' enrolled student '{student.name}' ({student.roll_no}) [Face Registered: {'YES' if student.face_registered else 'PENDING'}].",
            user=self.request.user,
            request=self.request
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        user = self.request.user
        profile = getattr(user, 'profile', None)

        # Faculty isolation check: verify teacher is authorized for this student's class
        if not (user.is_superuser or user.is_staff or (profile and profile.role == 'admin')):
            assigned_class_ids = FacultyAssignment.objects.filter(teacher=user).values_list('academic_class_id', flat=True).distinct()
            if assigned_class_ids.exists() and instance.academic_class_id not in assigned_class_ids:
                AuditLog.log(
                    action='UNAUTHORIZED_ACCESS_BLOCKED',
                    entity='Student',
                    entity_id=str(instance.id),
                    description=f"Teacher '{user.username}' attempted unauthorized modification of student '{instance.roll_no}'.",
                    user=user,
                    request=self.request
                )
                raise PermissionDenied("You are not authorized to modify students outside your assigned classes.")

        student = serializer.save()

        # Update face embedding if profile_photo changed and face is not yet registered or updated
        if student.profile_photo and (not student.face_registered or not student.face_embedding):
            try:
                ok, embedding, details = extract_face_embedding(student.profile_photo)
                if ok and embedding:
                    student.face_embedding = json.dumps(embedding)
                    student.face_registered = True
                    student.face_registered_at = timezone.now()
                    student.save(update_fields=['face_embedding', 'face_registered', 'face_registered_at'])
            except Exception as e:
                print(f"[StudentViewSet] Biometric update note: {e}")

        AuditLog.log(
            action='STUDENT_UPDATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"User '{user.username}' updated student record '{student.name}' ({student.roll_no}).",
            user=user,
            request=self.request
        )

    @action(detail=True, methods=['post'], permission_classes=[IsTeacherOrAdmin])
    def register_face(self, request, pk=None):
        """
        Faculty captures student photo and registers their facial biometric features.
        Payload: { "photo": "data:image/jpeg;base64,..." }
        """
        student = self.get_object()
        photo = (request.data.get('photo') or request.data.get('image') or request.data.get('profile_photo') or '').strip()
        if not photo:
            return Response({"detail": "Face photo data is required."}, status=status.HTTP_400_BAD_REQUEST)

        ok, embedding, details = extract_face_embedding(photo)
        if not ok or not embedding:
            return Response({
                "detail": details.get("error", "No valid face detected. Please ensure the student is directly facing the camera in a well-lit environment."),
                "face_detected": False
            }, status=status.HTTP_400_BAD_REQUEST)

        student.profile_photo = photo
        student.face_embedding = json.dumps(embedding)
        student.face_registered = True
        student.face_registered_at = timezone.now()
        student.save(update_fields=['profile_photo', 'face_embedding', 'face_registered', 'face_registered_at'])

        AuditLog.log(
            action='STUDENT_FACE_REGISTER',
            entity='Student',
            entity_id=str(student.id),
            description=f"Faculty '{request.user.username}' registered biometric face features for '{student.name}' ({student.roll_no}).",
            user=request.user,
            request=request
        )

        return Response({
            "success": True,
            "message": f"Biometric face successfully registered for {student.name} ({student.roll_no})!",
            "student_id": student.id,
            "student_name": student.name,
            "face_registered": True,
            "confidence": details.get("confidence", 1.0),
            "registered_at": student.face_registered_at.isoformat()
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def detect_face(self, request):
        """
        Real-time camera helper: checks if a captured frame contains a valid face.
        Returns face box and confidence so user has immediate feedback.
        Payload: { "image": "data:image/jpeg;base64,..." }
        """
        photo = (request.data.get('image') or request.data.get('photo') or '').strip()
        if not photo:
            return Response({"detail": "Image data is required."}, status=status.HTTP_400_BAD_REQUEST)

        ok, embedding, details = extract_face_embedding(photo)
        return Response({
            "face_detected": ok,
            "confidence": details.get("confidence", 0.0),
            "box": details.get("box", None),
            "error": details.get("error", None) if not ok else None
        }, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        instance.deactivate()
        AuditLog.log(
            action='STUDENT_DEACTIVATE',
            entity='Student',
            entity_id=str(instance.id),
            description=f"Admin '{self.request.user.username}' deactivated student '{instance.name}' ({instance.roll_no}).",
            user=self.request.user,
            request=self.request
        )

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def deactivate(self, request, pk=None):
        student = self.get_object()
        student.deactivate()
        AuditLog.log(
            action='STUDENT_DEACTIVATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"Admin '{request.user.username}' deactivated student '{student.name}' ({student.roll_no}).",
            user=request.user,
            request=request
        )
        return Response({
            "detail": f"Student '{student.name}' ({student.roll_no}) deactivated successfully.",
            "is_active": False
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def activate(self, request, pk=None):
        student = self.get_object()
        student.activate()
        AuditLog.log(
            action='STUDENT_ACTIVATE',
            entity='Student',
            entity_id=str(student.id),
            description=f"Admin '{request.user.username}' restored student '{student.name}' ({student.roll_no}).",
            user=request.user,
            request=request
        )
        return Response({
            "detail": f"Student '{student.name}' ({student.roll_no}) restored successfully.",
            "is_active": True
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], permission_classes=[IsTeacherOrAdmin])
    def stats(self, request):
        qs = self.get_queryset()
        total = qs.count()
        active = qs.filter(is_active=True).count()
        inactive = total - active
        by_branch = list(
            qs.filter(is_active=True)
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