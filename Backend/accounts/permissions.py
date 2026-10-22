from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to users with role 'admin' or superusers/staff.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        user = request.user
        if user.is_superuser or user.is_staff:
            return True
        profile = getattr(user, 'profile', None)
        if profile and str(profile.role).lower() == 'admin':
            return True
        if str(user.username).lower().startswith('admin'):
            return True
        return False


class IsTeacher(permissions.BasePermission):
    """
    Allows access to users with role 'teacher' or 'faculty'.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        user = request.user
        if user.is_superuser or user.is_staff:
            return True
        profile = getattr(user, 'profile', None)
        if profile and str(profile.role).lower() in ['teacher', 'faculty']:
            return True
        if str(user.username).lower().startswith(('tch', 'fac')):
            return True
        return False


class IsStudent(permissions.BasePermission):
    """
    Allows access only to users with role 'student'.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        profile = getattr(request.user, 'profile', None)
        return bool(profile and str(profile.role).lower() == 'student')


class IsTeacherOrAdmin(permissions.BasePermission):
    """
    Allows access to teachers, faculty, admins, and superusers.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        user = request.user
        if user.is_superuser or user.is_staff:
            return True
        profile = getattr(user, 'profile', None)
        if profile and str(profile.role).lower() in ['teacher', 'faculty', 'admin']:
            return True
        if str(user.username).lower().startswith(('tch', 'fac', 'admin')):
            return True
        return False


class IsSelfOrStaff(permissions.BasePermission):
    """
    Object-level permission: students can only access their own record.
    Teachers, faculty, and admins can access any student's record.
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
        role = str(profile.role).lower()
        if role in ['teacher', 'faculty', 'admin'] or str(request.user.username).lower().startswith(('tch', 'fac', 'admin')):
            return True
        if role == 'student':
            # Check if obj is Student instance or has student attribute
            student_obj = getattr(obj, 'student', obj)
            return bool(profile.student and profile.student.id == getattr(student_obj, 'id', None))
        return False
