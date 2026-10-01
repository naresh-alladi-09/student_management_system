from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from audit.models import AuditLog
from .models import UserProfile, LoginAttempt
from .permissions import IsAdmin
from .serializers import UserSerializer
from .utils import get_client_ip, validate_strong_password
from students.models import Student

COLLEGE_DEPARTMENTS = [
    "Computer Science & Engineering",
    "Artificial Intelligence & Machine Learning",
    "Information Technology",
    "Electronics & Communication Engineering",
    "Electrical & Electronics Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "University Administration",
]

DEPARTMENT_MAP = {
    'CSE': 'Computer Science & Engineering',
    'AIML': 'Artificial Intelligence & Machine Learning',
    'IT': 'Information Technology',
    'ECE': 'Electronics & Communication Engineering',
    'EEE': 'Electrical & Electronics Engineering',
    'MECH': 'Mechanical Engineering',
    'CIVIL': 'Civil Engineering',
    'ADMIN': 'University Administration',
}


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_view(request):
    """
    Authenticate a user (admin, teacher, or student) and return an Auth Token with profile details.
    Enforces brute-force protection (lockout) and account activation checks.
    Accepts: { "username": "...", "password": "...", "role": "admin" | "teacher" | "student" (optional) }
    """
    ip = get_client_ip(request)
    raw_ident = (request.data.get('username') or request.data.get('identifier') or '').strip()
    password = (request.data.get('password') or '').strip()
    role_requested = request.data.get('role', None)

    if not raw_ident or not password:
        return Response(
            {"detail": "Both username/identifier and password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 1. Brute-force lockout check
    is_locked, rem_mins = LoginAttempt.is_locked_out(raw_ident, ip)
    if is_locked:
        AuditLog.log(
            action='LOGIN_LOCKOUT',
            entity='User',
            entity_id=raw_ident,
            description=f"Blocked login attempt for '{raw_ident}' from IP {ip} due to rate limiting lockout ({rem_mins} mins remaining).",
            request=request
        )
        return Response(
            {"detail": f"Account temporarily locked due to too many failed attempts. Please try again in {rem_mins} minute(s)."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    # 2. Try direct username authentication
    user = authenticate(username=raw_ident, password=password)

    # 3. If direct auth failed, resolve User by username, email, Teacher/Admin ID (employee_id), or Student (student_id / roll_no / email)
    if user is None:
        user_obj = User.objects.filter(username__iexact=raw_ident).first()
        if not user_obj:
            user_obj = User.objects.filter(email__iexact=raw_ident).first()

        # Check by Teacher ID or Admin ID (employee_id)
        if not user_obj:
            prof_match = UserProfile.objects.filter(employee_id__iexact=raw_ident).first()
            if not prof_match:
                clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
                for p in UserProfile.objects.exclude(employee_id__isnull=True).exclude(employee_id=''):
                    if (p.employee_id or '').replace('-', '').replace('_', '').replace(' ', '').upper() == clean_ident:
                        prof_match = p
                        break
            if prof_match:
                user_obj = prof_match.user

        student = None
        if not user_obj:
            # Check student by direct match
            student = (
                Student.objects.filter(student_id__iexact=raw_ident).first() or
                Student.objects.filter(roll_no__iexact=raw_ident).first() or
                Student.objects.filter(email__iexact=raw_ident).first() or
                Student.objects.filter(phone=raw_ident).first()
            )
            # If not matched directly, check normalized format
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
                    # Provision user with UNUSABLE password — must be activated
                    ident = (student.student_id or student.roll_no or f"STU{student.id}").strip()
                    user_obj, _ = User.objects.get_or_create(
                        username=ident,
                        defaults={"email": student.email or '', "first_name": student.name or ''}
                    )
                    user_obj.set_unusable_password()
                    user_obj.save()
                    prof, _ = UserProfile.objects.update_or_create(
                        user=user_obj,
                        defaults={
                            "role": "student",
                            "student": student,
                            "phone": (student.phone or '')[:30],
                            "department": student.department or '',
                            "is_activated": False,
                        }
                    )
                    prof.generate_activation_token()

        if user_obj:
            # Standard authentication against Django's secure hashed password
            user = authenticate(username=user_obj.username, password=password)

    # 4. Handle authentication failure
    if not user:
        is_now_locked = LoginAttempt.record_failure(raw_ident, ip)
        AuditLog.log(
            action='LOGIN_FAILED',
            entity='User',
            entity_id=raw_ident,
            description=f"Failed login attempt for '{raw_ident}' from IP {ip}.",
            request=request
        )
        if is_now_locked:
            return Response(
                {"detail": "Too many failed attempts. Account temporarily locked for 15 minutes."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        return Response(
            {"detail": "Invalid credentials. Please check your username/identifier and password."},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # 5. Clear brute-force attempts on successful password verification
    LoginAttempt.record_success(raw_ident, ip)

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

    # 6. Check student account activation status
    if profile.role == 'student' and not profile.is_activated:
        s = profile.student
        return Response(
            {
                "detail": "Your student account is not activated yet. Please activate your account with your activation token and create your secure password.",
                "needs_activation": True,
                "identifier": user.username,
                "student_id": s.student_id if s else user.username,
                "roll_no": s.roll_no if s else user.username,
            },
            status=status.HTTP_403_FORBIDDEN
        )

    # 7. Check role alignment if requested
    if role_requested and not user.is_superuser:
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
        "user_id_code": profile.user_id_code,
        "employee_id": profile.employee_id,
        "username": user.username,
        "email": user.email,
        "role": profile.role,
        "name": user.get_full_name() or user.username,
        "department": profile.department,
        "profile_pic": profile.profile_pic or (profile.student.profile_photo if (profile.role == 'student' and profile.student) else ""),
        "is_staff": user.is_staff or user.is_superuser,
        "must_change_password": profile.must_change_password,
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
            "profile_photo": s.profile_photo or profile.profile_pic,
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
@authentication_classes([])
@permission_classes([AllowAny])
def activate_student_account(request):
    """
    Securely activate a student account using an activation token and a user-chosen strong password.
    Accepts: {
        "identifier": "...", # Roll number, Student ID, username, or email
        "activation_token": "...",
        "new_password": "...",
        "confirm_password": "..."
    }
    """
    ip = get_client_ip(request)
    identifier = (request.data.get('identifier') or '').strip()
    token = (request.data.get('activation_token') or '').strip()
    new_password = (request.data.get('new_password') or '').strip()
    confirm_password = (request.data.get('confirm_password') or '').strip()

    if not identifier or not token or not new_password or not confirm_password:
        return Response(
            {"detail": "Student identifier, activation token, new password, and confirm password are all required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Brute-force lockout check on activation endpoint
    is_locked, rem_mins = LoginAttempt.is_locked_out(identifier, ip)
    if is_locked:
        return Response(
            {"detail": f"Too many failed attempts. Please try again in {rem_mins} minute(s)."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    if new_password != confirm_password:
        return Response(
            {"detail": "Passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Resolve student and profile
    student = (
        Student.objects.filter(student_id__iexact=identifier).first() or
        Student.objects.filter(roll_no__iexact=identifier).first() or
        Student.objects.filter(email__iexact=identifier).first()
    )
    profile = None
    if student and hasattr(student, 'user_profile') and student.user_profile:
        profile = student.user_profile
    else:
        user_obj = User.objects.filter(username__iexact=identifier).first() or User.objects.filter(email__iexact=identifier).first()
        profile = getattr(user_obj, 'profile', None) if user_obj else None

    if not profile or profile.role != 'student':
        LoginAttempt.record_failure(identifier, ip)
        return Response(
            {"detail": "No matching student account found for the provided identifier."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate token
    if not profile.is_activation_token_valid(token):
        LoginAttempt.record_failure(identifier, ip)
        AuditLog.log(
            action='LOGIN_FAILED',
            entity='Student',
            entity_id=identifier,
            description=f"Invalid or expired activation token attempt for '{identifier}' from IP {ip}.",
            request=request
        )
        return Response(
            {"detail": "Invalid or expired activation token. Please verify or request a new token from your administrator."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Prevent using roll number or student ID as password
    ident_clean = identifier.lower().replace('-', '').replace('_', '').replace(' ', '')
    pw_clean = new_password.lower().replace('-', '').replace('_', '').replace(' ', '')
    if ident_clean and (ident_clean in pw_clean or (len(pw_clean) >= 4 and pw_clean in ident_clean)):
        return Response(
            {"detail": "For security, your password cannot match or contain your Student ID or Roll Number."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Enforce strong password requirements
    pw_errors = validate_strong_password(new_password, user=profile.user)
    if pw_errors:
        return Response(
            {"detail": "Password does not meet security requirements: " + "; ".join(pw_errors), "errors": pw_errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Securely set password and activate account
    user = profile.user
    user.set_password(new_password)
    user.is_active = True
    user.save()

    profile.is_activated = True
    profile.activation_token = None
    profile.activation_token_expires_at = None
    profile.must_change_password = False
    profile.save(update_fields=['is_activated', 'activation_token', 'activation_token_expires_at', 'must_change_password'])

    LoginAttempt.record_success(identifier, ip)

    auth_token, _ = Token.objects.get_or_create(user=user)

    AuditLog.log(
        action='STUDENT_ACCOUNT_ACTIVATE',
        entity='Student',
        entity_id=str(user.id),
        description=f"Student '{user.username}' successfully activated their account and set a secure password.",
        user=user,
        request=request
    )

    s = profile.student
    return Response({
        "detail": "Account activated successfully. You are now logged in.",
        "token": auth_token.key,
        "user_id": user.id,
        "user_id_code": profile.user_id_code,
        "username": user.username,
        "email": user.email,
        "role": profile.role,
        "name": user.get_full_name() or (s.name if s else user.username),
        "department": profile.department,
        "profile_pic": profile.profile_pic or (s.profile_photo if s else ""),
        "student": {
            "id": s.id,
            "name": s.name,
            "rollNo": s.roll_no or f"STU-2024-{s.id:03d}",
            "email": s.email,
            "phone": s.phone,
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
            "profile_photo": s.profile_photo or profile.profile_pic,
        } if s else None
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def request_activation_token(request):
    """
    Request or regenerate an activation token for an unactivated student account.
    Accepts: { "identifier": "...", "email": "..." }
    """
    ip = get_client_ip(request)
    identifier = (request.data.get('identifier') or '').strip()
    email = (request.data.get('email') or '').strip().lower()

    if not identifier:
        return Response(
            {"detail": "Student ID or Roll Number is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    is_locked, rem_mins = LoginAttempt.is_locked_out(identifier, ip)
    if is_locked:
        return Response(
            {"detail": f"Too many requests. Please wait {rem_mins} minute(s) before trying again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    student = (
        Student.objects.filter(student_id__iexact=identifier).first() or
        Student.objects.filter(roll_no__iexact=identifier).first()
    )

    if not student:
        LoginAttempt.record_failure(identifier, ip)
        return Response(
            {"detail": "No student record found with the provided identifier."},
            status=status.HTTP_404_NOT_FOUND
        )

    if email and student.email and student.email.lower() != email:
        LoginAttempt.record_failure(identifier, ip)
        return Response(
            {"detail": "Provided email does not match institutional student record."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not hasattr(student, 'user_profile') or not student.user_profile:
        ident = (student.student_id or student.roll_no or f"STU{student.id}").strip()
        user, _ = User.objects.get_or_create(username=ident, defaults={"email": student.email or '', "first_name": student.name or ''})
        user.set_unusable_password()
        user.save()
        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={"role": "student", "student": student, "is_activated": False}
        )
    else:
        profile = student.user_profile

    token = profile.generate_activation_token(hours=168)

    AuditLog.log(
        action='ACTIVATION_TOKEN_REQUEST',
        entity='Student',
        entity_id=str(student.id),
        description=f"Activation token requested for student '{student.roll_no}'.",
        request=request
    )

    return Response({
        "detail": "Activation token generated. Use this token to complete your account activation.",
        "activation_token": token,
        "expires_in_hours": 168
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """
    Allow authenticated user to change their password securely.
    Accepts: { "current_password": "...", "new_password": "...", "confirm_password": "..." }
    """
    user = request.user
    ip = get_client_ip(request)
    current_password = request.data.get('current_password', '')
    new_password = request.data.get('new_password', '')
    confirm_password = request.data.get('confirm_password', '')

    if not current_password or not new_password or not confirm_password:
        return Response(
            {"detail": "Current password, new password, and password confirmation are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not user.check_password(current_password):
        LoginAttempt.record_failure(user.username, ip)
        return Response(
            {"detail": "Current password is incorrect."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if new_password != confirm_password:
        return Response(
            {"detail": "New passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if current_password == new_password:
        return Response(
            {"detail": "New password cannot be identical to your current password."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Disallow predictable roll number / student ID password for students
    profile = getattr(user, 'profile', None)
    if profile and profile.role == 'student' and profile.student:
        s = profile.student
        for p in [s.roll_no, s.student_id, user.username]:
            if p and p.lower() in new_password.lower():
                return Response(
                    {"detail": "Password cannot contain your Student ID or Roll Number."},
                    status=status.HTTP_400_BAD_REQUEST
                )

    pw_errors = validate_strong_password(new_password, user=user)
    if pw_errors:
        return Response(
            {"detail": "New password does not meet security requirements: " + "; ".join(pw_errors), "errors": pw_errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_password)
    user.save()

    if profile:
        profile.must_change_password = False
        profile.save(update_fields=['must_change_password'])

    AuditLog.log(
        action='PASSWORD_CHANGE',
        entity='User',
        entity_id=str(user.id),
        description=f"User '{user.username}' changed their password.",
        user=user,
        request=request
    )

    return Response({"detail": "Password updated successfully."}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([IsAdmin])
def admin_student_activation_view(request, student_id):
    """
    Admin-only endpoint to view activation status or generate a fresh activation token for a student.
    """
    student = Student.objects.filter(pk=student_id).first()
    if not student:
        return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

    profile = getattr(student, 'user_profile', None)
    if not profile:
        ident = (student.student_id or student.roll_no or f"STU{student.id}").strip()
        user, _ = User.objects.get_or_create(username=ident, defaults={"email": student.email or '', "first_name": student.name or ''})
        user.set_unusable_password()
        user.save()
        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={"role": "student", "student": student, "is_activated": False}
        )

    if request.method == 'POST':
        token = profile.generate_activation_token(hours=168)
        AuditLog.log(
            action='ACTIVATION_TOKEN_REQUEST',
            entity='Student',
            entity_id=str(student.id),
            description=f"Admin '{request.user.username}' generated activation token for student '{student.roll_no}'.",
            user=request.user,
            request=request
        )
        return Response({
            "detail": "New activation token generated successfully.",
            "activation_token": token,
            "is_activated": profile.is_activated,
            "expires_at": profile.activation_token_expires_at
        }, status=status.HTTP_200_OK)

    return Response({
        "is_activated": profile.is_activated,
        "has_active_token": bool(profile.activation_token and profile.is_activation_token_valid(profile.activation_token)),
        "activation_token": profile.activation_token if not profile.is_activated else None,
        "expires_at": profile.activation_token_expires_at,
        "must_change_password": profile.must_change_password
    }, status=status.HTTP_200_OK)



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
    Return currently authenticated user information with profile picture.
    """
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if user.is_superuser and profile.role != 'admin':
        profile.role = 'admin'
        profile.save()

    active_pic = profile.profile_pic or (profile.student.profile_photo if (profile.role == 'student' and profile.student) else "")

    data = {
        "id": user.id,
        "user_id_code": profile.user_id_code,
        "employee_id": profile.employee_id,
        "username": user.username,
        "email": user.email,
        "name": user.get_full_name() or user.username,
        "role": profile.role,
        "department": profile.department,
        "profile_pic": active_pic,
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
            "profile_photo": s.profile_photo or active_pic,
        }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['POST', 'PUT'])
@permission_classes([IsAuthenticated])
def update_profile_picture(request):
    """
    Allow any authenticated user (Student, Faculty/Teacher, Admin) to set or update their profile picture.
    Accepts: { "profile_pic": "data:image/... or URL" } or uploaded file.
    """
    user = request.user
    profile, _ = UserProfile.objects.get_or_create(user=user)

    profile_pic = request.data.get('profile_pic', '')
    if not profile_pic and 'file' in request.FILES:
        import base64
        uploaded_file = request.FILES['file']
        content_type = uploaded_file.content_type or 'image/jpeg'
        encoded_data = base64.b64encode(uploaded_file.read()).decode('utf-8')
        profile_pic = f"data:{content_type};base64,{encoded_data}"

    if not profile_pic:
        return Response({"detail": "Profile picture image data is required."}, status=status.HTTP_400_BAD_REQUEST)

    profile.profile_pic = profile_pic
    profile.save(update_fields=['profile_pic'])

    # If student, sync to student model as well
    if profile.role == 'student' and profile.student:
        profile.student.profile_photo = profile_pic
        profile.student.save(update_fields=['profile_photo'])

    AuditLog.log(
        action='UPDATE_PROFILE_PICTURE',
        entity='User',
        entity_id=str(user.id),
        description=f"User '{user.username}' ({profile.role}) updated their profile photograph.",
        user=user,
        request=request
    )

    return Response({
        "detail": "Profile picture updated successfully.",
        "profile_pic": profile.profile_pic,
        "name": user.get_full_name() or user.username,
        "role": profile.role
    }, status=status.HTTP_200_OK)


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
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '').strip()
        first_name = request.data.get('first_name', '').strip()
        last_name = request.data.get('last_name', '').strip()
        role = request.data.get('role', 'teacher').strip().lower()
        raw_department = request.data.get('department', '').strip()
        custom_user_id = (
            request.data.get('employee_id') or
            request.data.get('user_id_code') or
            request.data.get('custom_id') or
            ''
        ).strip().upper()

        if not username or not password or not email or not raw_department:
            return Response(
                {"detail": "Username, email, password, and department are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if role not in ['admin', 'teacher', 'student']:
            return Response(
                {"detail": f"Invalid role '{role}'. Allowed roles are 'admin', 'teacher', 'student'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Email format check
        try:
            validate_email(email)
        except ValidationError:
            return Response(
                {"detail": "Invalid email address format."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Strict Requirement: Only valid Gmail addresses ending with @gmail.com
        if not email.endswith('@gmail.com'):
            return Response(
                {"detail": "Email must be a valid address ending with @gmail.com (e.g. name@gmail.com). Other email domains are not allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Strict Requirement: Departments must be college limited
        norm_department = DEPARTMENT_MAP.get(raw_department.upper(), raw_department)
        if norm_department not in COLLEGE_DEPARTMENTS:
            return Response(
                {
                    "detail": f"Invalid department '{raw_department}'. Department must be one of the college-authorized options: {', '.join(COLLEGE_DEPARTMENTS)}."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        department = norm_department

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

        # 4. Strict Requirement: Separate User ID for teachers and admins
        prefix = 'TCH' if role == 'teacher' else ('ADM' if role == 'admin' else 'STU')
        if custom_user_id:
            # Enforce proper prefix for role
            if not custom_user_id.startswith(prefix):
                clean_body = custom_user_id.replace('-', '').strip()
                custom_user_id = f"{prefix}-{clean_body}"

            if UserProfile.objects.filter(employee_id__iexact=custom_user_id).exists():
                return Response(
                    {"detail": f"User ID '{custom_user_id}' is already in use. Please choose another ID or leave blank to auto-generate."},
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

        # If User ID was not specified by admin, auto-generate unique ID based on role prefix
        if not custom_user_id:
            candidate = f"{prefix}-{user.id:03d}"
            cnt = user.id
            while UserProfile.objects.filter(employee_id__iexact=candidate).exists():
                cnt += 1
                candidate = f"{prefix}-{cnt:03d}"
            custom_user_id = candidate

        profile, _ = UserProfile.objects.update_or_create(
            user=user,
            defaults={"role": role, "department": department, "employee_id": custom_user_id}
        )

        action_choice = 'TEACHER_CREATE' if role == 'teacher' else 'USER_CREATE'
        AuditLog.log(
            action=action_choice,
            entity='User',
            entity_id=str(user.id),
            description=f"Admin created {role} '{username}' with User ID '{profile.user_id_code}' in department '{department}'.",
            user=request.user,
            request=request
        )

        return Response(
            {
                "detail": f"{role.capitalize()} '{username}' provisioned successfully with User ID '{profile.user_id_code}'.",
                "user_id": user.id,
                "user_id_code": profile.user_id_code,
                "employee_id": profile.employee_id,
            },
            status=status.HTTP_201_CREATED
        )

