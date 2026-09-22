from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from .models import UserProfile
from .permissions import IsAdmin
from .serializers import UserSerializer
from students.models import Student


@api_view(['POST'])
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

    # 2. If direct auth failed and input looks like an email or roll_no, resolve User
    if user is None:
        user_obj = User.objects.filter(email__iexact=raw_ident).first()
        if not user_obj:
            # Check student by roll_no or email or phone
            student = (
                Student.objects.filter(roll_no__iexact=raw_ident).first() or
                Student.objects.filter(email__iexact=raw_ident).first() or
                Student.objects.filter(phone=raw_ident).first()
            )
            if student and hasattr(student, 'user_profile'):
                user_obj = student.user_profile.user

        if user_obj:
            user = authenticate(username=user_obj.username, password=password)

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

    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Invalidates the caller's auth token.
    """
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
        role = request.data.get('role', 'teacher')
        department = request.data.get('department', 'Academic Operations')

        if not username or not password or not email:
            return Response(
                {"detail": "Username, email, and password are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {"detail": f"Username '{username}' already exists."},
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

        return Response(
            {"detail": f"User '{username}' created successfully as '{role}'.", "user_id": user.id},
            status=status.HTTP_201_CREATED
        )
