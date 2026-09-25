from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from audit.models import AuditLog
from .models import UserProfile
from .permissions import IsAdmin
from .serializers import UserSerializer
from students.models import Student


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate a user (admin, teacher, or student) and return an Auth Token with profile details.
    Accepts: { "username": "...", "password": "...", "role": "admin" | "teacher" | "student" (optional) }
    """
    raw_ident = (request.data.get('username') or request.data.get('identifier') or '').strip()
    password = (request.data.get('password') or '').strip()
    role_requested = request.data.get('role', None)

    if not raw_ident or not password:
        return Response(
            {"detail": "Both username/email and password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 1. Try direct username authentication
    user = authenticate(username=raw_ident, password=password)

    # 2. If direct auth failed, resolve User by username, email, or Student (student_id / roll_no / email)
    if user is None:
        user_obj = User.objects.filter(username__iexact=raw_ident).first()
        if not user_obj:
            user_obj = User.objects.filter(email__iexact=raw_ident).first()

        student = None
        if not user_obj:
            # Check student by direct match
            student = (
                Student.objects.filter(student_id__iexact=raw_ident).first() or
                Student.objects.filter(roll_no__iexact=raw_ident).first() or
                Student.objects.filter(email__iexact=raw_ident).first() or
                Student.objects.filter(phone=raw_ident).first()
            )
            # If not matched directly, check normalized format (e.g., STU2024001 matching STU-2024-001 or STU20240001)
            if not student:
                clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
                for s in Student.objects.all():
                    s_roll_clean = (s.roll_no or '').replace('-', '').replace('_', '').replace(' ', '').upper()
                    s_id_clean = (s.student_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()
                    if clean_ident in (s_roll_clean, s_id_clean) or s_roll_clean == clean_ident or s_id_clean == clean_ident:
                        student = s
                        break

            if student:
                if hasattr(student, 'user_profile') and student.user_profile and student.user_profile.user:
                    user_obj = student.user_profile.user
                else:
                    # Provision user on the fly if missing
                    ident = (student.student_id or student.roll_no or f"STU{student.id}").strip()
                    user_obj, _ = User.objects.get_or_create(
                        username=ident,
                        defaults={"email": student.email or '', "first_name": student.name or ''}
                    )
                    user_obj.set_password(ident)
                    user_obj.save()
                    UserProfile.objects.update_or_create(
                        user=user_obj,
                        defaults={
                            "role": "student",
                            "student": student,
                            "phone": (student.phone or '')[:30],
                            "department": student.department or ''
                        }
                    )
        else:
            if hasattr(user_obj, 'profile') and user_obj.profile.student:
                student = user_obj.profile.student

        if user_obj:
            # First try standard authentication
            user = authenticate(username=user_obj.username, password=password)

            # If user is a student, check if password matches their studentid from backend
            if not user and student:
                clean_pass = password.replace('-', '').replace('_', '').replace(' ', '').upper()
                s_roll_clean = (student.roll_no or '').replace('-', '').replace('_', '').replace(' ', '').upper()
                s_id_clean = (student.student_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()

                valid_passwords = [
                    (student.student_id or '').strip(),
                    (student.student_id or '').strip().upper(),
                    (student.student_id or '').strip().lower(),
                    (student.roll_no or '').strip(),
                    (student.roll_no or '').strip().upper(),
                    (student.roll_no or '').strip().lower(),
                    s_roll_clean,
                    s_id_clean,
                ]
                valid_passwords = [p for p in valid_passwords if p]
                if (
                    password in valid_passwords or
                    clean_pass in (s_roll_clean, s_id_clean) or
                    password.upper() in valid_passwords or
                    password.lower() in valid_passwords
                ):
                    # Password matches studentid in backend! Sync password on user
                    user_obj.set_password(student.student_id or password)
                    user_obj.save()
                    user = user_obj


    if not user:
        return Response(
            {"detail": "Invalid credentials. Please check your username/identifier and password."},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if not user.is_active:
        return Response(
            {"detail": "This user account is inactive. Please contact the administrator."},
            status=status.HTTP_403_FORBIDDEN
        )

    # Ensure profile exists
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if user.is_superuser and profile.role != 'admin':
        profile.role = 'admin'
        profile.save()

    # Check role alignment if requested
    if role_requested and not user.is_superuser:
        # Teachers and Admins can share teacher-level views, but student cannot enter teacher/admin
        if role_requested == 'teacher' and profile.role not in ['teacher', 'admin']:
            return Response(
                {"detail": f"Account exists, but is registered as '{profile.role}', not '{role_requested}'."},
                status=status.HTTP_403_FORBIDDEN
            )
        elif role_requested == 'admin' and profile.role != 'admin':
            return Response(
                {"detail": "Access restricted. Administrator privileges required."},
                status=status.HTTP_403_FORBIDDEN
            )
        elif role_requested == 'student' and profile.role != 'student':
            return Response(
                {"detail": f"Account exists, but is registered as '{profile.role}', not 'student'."},
                status=status.HTTP_403_FORBIDDEN
            )

    token, _ = Token.objects.get_or_create(user=user)

    response_data = {
        "token": token.key,
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "role": profile.role,
        "name": user.get_full_name() or user.username,
        "department": profile.department,
        "is_staff": user.is_staff or user.is_superuser,
    }

    if profile.role == 'student' and profile.student:
        s = profile.student
        response_data["student"] = {
            "id": s.id,
            "name": s.name,
            "rollNo": s.roll_no or f"STU-2024-{s.id:03d}",
            "email": s.email,
            "phone": s.phone,
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
        }

    AuditLog.log(
        action='LOGIN',
        entity='User',
        entity_id=str(user.id),
        description=f"User '{user.username}' successfully authenticated into role '{profile.role}'.",
        user=user,
        request=request
    )

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Invalidates the caller's auth token and logs logout event.
    """
    AuditLog.log(
        action='LOGOUT',
        entity='User',
        entity_id=str(request.user.id),
        description=f"User '{request.user.username}' logged out.",
        user=request.user,
        request=request
    )
    try:
        request.user.auth_token.delete()
    except Exception:
        pass
    return Response({"detail": "Successfully logged out."}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    """
    Return currently authenticated user information.
    """
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if user.is_superuser and profile.role != 'admin':
        profile.role = 'admin'
        profile.save()

    data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": user.get_full_name() or user.username,
        "role": profile.role,
        "department": profile.department,
        "is_staff": user.is_staff or user.is_superuser,
    }
    if profile.role == 'student' and profile.student:
        s = profile.student
        data["student"] = {
            "id": s.id,
            "name": s.name,
            "rollNo": s.roll_no or f"STU-2024-{s.id:03d}",
            "email": s.email,
            "phone": s.phone,
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
        }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([IsAdmin])
def manage_users_view(request):
    """
    Admin-only endpoint to list or create system users (teachers, admins).
    """
    if request.method == 'GET':
        role_filter = request.query_params.get('role', None)
        users = User.objects.all().select_related('profile').order_by('-date_joined')
        if role_filter:
            users = users.filter(profile__role=role_filter)
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        username = request.data.get('username', '').strip()
        email = request.data.get('email', '').strip()
        password = request.data.get('password', '').strip()
        first_name = request.data.get('first_name', '').strip()
        last_name = request.data.get('last_name', '').strip()
        role = request.data.get('role', 'teacher').strip().lower()
        department = request.data.get('department', 'Academic Operations').strip()

        if not username or not password or not email:
            return Response(
                {"detail": "Username, email, and password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if role not in ['admin', 'teacher', 'student']:
            return Response(
                {"detail": f"Invalid role '{role}'. Allowed roles are 'admin', 'teacher', 'student'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"detail": "Invalid email address format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(username__iexact=username).exists():
            return Response(
                {"detail": f"Username '{username}' already exists."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"detail": f"A user with email '{email}' already exists."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(password) < 4:
            return Response(
                {"detail": "Password must be at least 4 characters long."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            first_name=first_name,
            last_name=last_name
        )
        if role == 'admin':
            user.is_staff = True
            user.save()

        UserProfile.objects.update_or_create(
            user=user,
            defaults={"role": role, "department": department}
        )

        action_choice = 'TEACHER_CREATE' if role == 'teacher' else 'USER_CREATE'
        AuditLog.log(
            action=action_choice,
            entity='User',
            entity_id=str(user.id),
            description=f"Admin created user '{username}' with role '{role}' in department '{department}'.",
            user=request.user,
            request=request
        )

        return Response(
            {"detail": f"User '{username}' created successfully as '{role}'.", "user_id": user.id},
            status=status.HTTP_201_CREATED
        )
