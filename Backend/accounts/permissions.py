from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to users with role 'admin' or superusers/staff.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser or request.user.is_staff:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'admin')


class IsTeacher(permissions.BasePermission):
    """
    Allows access only to users with role 'teacher'.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'teacher')


class IsStudent(permissions.BasePermission):
    """
    Allows access only to users with role 'student'.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'student')


class IsTeacherOrAdmin(permissions.BasePermission):
    """
    Allows access to teachers, admins, and superusers.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser or request.user.is_staff:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in ['teacher', 'admin'])


class IsSelfOrStaff(permissions.BasePermission):
    """
    Object-level permission: students can only access their own record.
    Teachers and admins can access any student's record.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser or request.user.is_staff:
            return True
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return False
        if profile.role in ['teacher', 'admin']:
            return True
        if profile.role == 'student':
            # Check if obj is Student instance or has student attribute
            student_obj = getattr(obj, 'student', obj)
            return bool(profile.student and profile.student.id == getattr(student_obj, 'id', None))
        return False
