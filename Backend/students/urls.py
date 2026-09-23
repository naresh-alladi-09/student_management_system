from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    StudentViewSet,
    DepartmentViewSet,
    BranchViewSet,
    AcademicClassViewSet,
    FacultyAssignmentViewSet,
    health_check,
)

student_router = DefaultRouter()
student_router.register(r'', StudentViewSet, basename='student')

academic_router = DefaultRouter()
academic_router.register(r'departments', DepartmentViewSet, basename='department')
academic_router.register(r'branches', BranchViewSet, basename='branch')
academic_router.register(r'classes', AcademicClassViewSet, basename='academic-class')
academic_router.register(r'faculty-assignments', FacultyAssignmentViewSet, basename='faculty-assignment')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('students/', include(student_router.urls)),
    path('', include(academic_router.urls)),
]