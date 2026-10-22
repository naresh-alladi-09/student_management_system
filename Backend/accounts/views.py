from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.shortcuts import get_object_or_404
from audit.models import AuditLog
from .models import UserProfile, LoginAttempt
from .permissions import IsAdmin, IsTeacherOrAdmin
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
        user_obj = None

        # If role requested is student or raw_ident starts with STU / contains roll delimiter, check Student first
        if role_requested == 'student' or raw_ident.upper().startswith('STU') or '-' in raw_ident:
            student = (
                Student.objects.filter(student_id__iexact=raw_ident).first() or
                Student.objects.filter(roll_no__iexact=raw_ident).first() or
                Student.objects.filter(email__iexact=raw_ident).first() or
                Student.objects.filter(phone=raw_ident).first()
            )
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

        if not user_obj:
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
            # Check if student or teacher password has not been set yet
            user_prof = getattr(user_obj, 'profile', None)
            if (not user_obj.has_usable_password() or (user_prof and not user_prof.is_activated)) and (user_prof and user_prof.role in ('student', 'teacher')):
                is_teacher = user_prof.role == 'teacher'
                s = getattr(user_prof, 'student', None)
                id_code = user_prof.employee_id or user_prof.user_id_code
                return Response(
                    {
                        "detail": f"Your {'faculty' if is_teacher else 'student'} account password is not set yet. Please set your password using your {'Teacher' if is_teacher else 'Student'} ID to activate your account.",
                        "needs_activation": True,
                        "needs_password_setup": True,
                        "identifier": user_obj.username,
                        "role": user_prof.role,
                        "teacher_id": id_code if is_teacher else None,
                        "student_id": (s.student_id if s else user_obj.username) if not is_teacher else None,
                        "roll_no": (s.roll_no if s else user_obj.username) if not is_teacher else None,
                    },
                    status=status.HTTP_403_FORBIDDEN
                )

            # Standard authentication against Django's secure hashed password
            user = authenticate(username=user_obj.username, password=password)

            if not user and user_obj.check_password(password) and not user_obj.is_active:
                return Response(
                    {"detail": "This student account is currently deactivated. Please contact your college administrator."},
                    status=status.HTTP_403_FORBIDDEN
                )

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

    # Link Student record if profile.student is None
    if profile.student is None and not user.is_superuser and not user.is_staff:
        from django.db.models import Q
        st = Student.objects.filter(
            Q(user_profile__user=user) |
            Q(student_id__iexact=user.username) |
            Q(roll_no__iexact=user.username) |
            Q(email__iexact=user.email)
        ).first()
        if not st:
            clean_ident = user.username.replace('-', '').replace('_', '').replace(' ', '').upper()
            for s in Student.objects.all():
                s_roll_clean = (s.roll_no or '').replace('-', '').replace('_', '').replace(' ', '').upper()
                s_id_clean = (s.student_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()
                if clean_ident in (s_roll_clean, s_id_clean):
                    st = s
                    break
        if st:
            profile.student = st
            profile.role = 'student'
            profile.save(update_fields=['student', 'role'])

    # 6. Check student account activation status
    if profile.role == 'student' and not profile.is_activated:
        s = profile.student
        return Response(
            {
                "detail": "Your student account password is not set yet. Please set your password using your Student ID to activate your account.",
                "needs_activation": True,
                "needs_password_setup": True,
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


def mask_email(email_str):
    if not email_str or '@' not in email_str:
        return 'your registered email'
    name_part, domain = email_str.split('@', 1)
    if len(name_part) <= 2:
        masked_name = name_part[0] + '*'
    else:
        masked_name = name_part[0] + ('*' * max(1, len(name_part) - 2)) + name_part[-1]
    return f"{masked_name}@{domain}"


def send_student_onboarding_email(student):
    """
    Dispatches official onboarding email containing Student ID, Roll Number, and login instructions.
    """
    if not student or not student.email:
        return False, {
            "message": "No student email address available.",
            "error": "No student email address available.",
            "sent": False
        }

    student_name = student.name
    student_id = student.student_id or student.roll_no or f"STU{student.id}"
    roll_no = student.roll_no or student_id
    dept_branch = f"{student.branch} ({student.department or 'Engineering'})"
    cohort = f"Year {student.year}, Semester {student.semester} - Section {student.section}"

    is_live_smtp = bool(getattr(settings, 'EMAIL_HOST_USER', '') and getattr(settings, 'EMAIL_HOST_PASSWORD', ''))
    backend_name = getattr(settings, 'EMAIL_BACKEND', '')

    subject = f"Welcome to Smart Campus: Your Student ID Details ({student_id})"
    plain_msg = (
        f"SMART CAMPUS ACADEMIC SUITE\n"
        f"STUDENT ENROLLMENT & CREDENTIAL NOTICE\n\n"
        f"Dear {student_name},\n\n"
        f"Welcome to the institution! Your student profile has been officially enrolled into the system.\n\n"
        f"YOUR ACADEMIC CREDENTIAL DETAILS:\n"
        f"--------------------------------------------------\n"
        f"• Student ID:       {student_id}\n"
        f"• Roll Number:      {roll_no}\n"
        f"• Branch:           {dept_branch}\n"
        f"• Cohort:           {cohort}\n"
        f"• Registered Email: {student.email}\n"
        f"--------------------------------------------------\n\n"
        f"HOW TO LOG IN TO THE STUDENT PORTAL:\n"
        f"1. Open the Student Portal Login page.\n"
        f"2. Click 'Set Initial Password' (or First time login).\n"
        f"3. Enter your Student ID: {student_id}\n"
        f"4. Choose your secure password and submit.\n"
        f"5. Once saved, log in anytime using your Student ID and chosen password.\n\n"
        f"FORGOT PASSWORD:\n"
        f"If you ever forget your password, click 'Forgot Password' on the login screen to receive a verification code at this email.\n\n"
        f"Office of Academic Affairs & Admissions\n"
        f"Smart Campus Management System"
    )

    html_msg = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:20px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#0f172a; color:#f8fafc;">
      <div style="max-width:580px; margin:0 auto; background:#1e293b; border-radius:14px; border:1px solid #334155; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.4);">
        <div style="background:linear-gradient(135deg, #059669 0%, #0d9488 100%); padding:28px 32px; text-align:center;">
          <h2 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">🎓 Welcome to Smart Campus</h2>
          <p style="margin:6px 0 0; color:#d1fae5; font-size:13px;">Official Student Enrollment & Login Details</p>
        </div>
        <div style="padding:32px;">
          <p style="font-size:15px; color:#cbd5e1; margin:0 0 16px;">Dear <strong>{student_name}</strong>,</p>
          <p style="font-size:14px; color:#94a3b8; line-height:1.6; margin:0 0 20px;">
            Your academic student profile has been registered in the institution's system. Please use the following details to set your password and access the Student Academic Portal:
          </p>
          <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:20px; margin-bottom:24px;">
            <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px; color:#cbd5e1;">
              <tr>
                <td width="38%" style="color:#94a3b8; font-weight:600;">Student ID:</td>
                <td><code style="background:#1e293b; color:#38bdf8; font-size:16px; font-weight:700; padding:3px 8px; border-radius:4px;">{student_id}</code></td>
              </tr>
              <tr>
                <td style="color:#94a3b8; font-weight:600;">Roll Number:</td>
                <td><strong style="color:#f8fafc;">{roll_no}</strong></td>
              </tr>
              <tr>
                <td style="color:#94a3b8; font-weight:600;">Branch / Dept:</td>
                <td>{dept_branch}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; font-weight:600;">Cohort:</td>
                <td>{cohort}</td>
              </tr>
            </table>
          </div>
          <h3 style="font-size:15px; color:#f8fafc; margin:0 0 12px;">Next Steps to Sign In:</h3>
          <ol style="font-size:13.5px; color:#94a3b8; line-height:1.7; margin:0 0 24px; padding-left:20px;">
            <li>Go to the <strong style="color:#f8fafc;">Student Portal</strong> login page.</li>
            <li>Click <strong style="color:#34d399;">"Set Password with Student ID"</strong>.</li>
            <li>Enter your Student ID: <strong style="color:#38bdf8;">{student_id}</strong>.</li>
            <li>Create your new password and submit.</li>
            <li>Log in anytime using your Student ID and password!</li>
          </ol>
          <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0;">
            Note: If you ever forget your password, click "Forgot Password" on the login screen to receive a reset code at this email address.
          </p>
          <div style="border-top:1px solid #334155; margin-top:24px; padding-top:18px; font-size:12px; color:#64748b; text-align:center;">
            Office of the Registrar & Academic Affairs • Smart Campus System
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    from accounts.email_service import send_smart_email
    ok, mail_info = send_smart_email(
        subject=subject,
        plain_msg=plain_msg,
        recipient_list=[student.email.strip()],
        html_msg=html_msg
    )

    if ok:
        return True, {
            "message": mail_info.get("message", f"Student ID details successfully sent to {student.email}."),
            "student_id": student_id,
            "student_name": student_name,
            "email": student.email,
            "roll_no": roll_no,
            "is_live_smtp": is_live_smtp or mail_info.get("is_live_smtp", False),
            "backend": mail_info.get("provider", backend_name),
            "subject": subject,
            "html_content": html_msg,
            "plain_text": plain_msg,
        }
    else:
        return False, {
            "message": mail_info.get("message", "Could not send onboarding email."),
            "error": mail_info.get("error", "Failed to dispatch email."),
            "student_id": student_id,
            "student_name": student_name,
            "email": student.email,
            "is_live_smtp": is_live_smtp,
            "backend": backend_name,
        }


def send_teacher_onboarding_email(user_or_profile):
    """
    Dispatches official onboarding email containing Teacher ID, designation, department, and password setup instructions.
    """
    if not user_or_profile:
        return False, {
            "message": "No faculty user provided.",
            "error": "No faculty user provided.",
            "sent": False
        }

    if hasattr(user_or_profile, 'user'):
        profile = user_or_profile
        user = user_or_profile.user
    else:
        user = user_or_profile
        profile = getattr(user, 'profile', None)

    if not user or not user.email:
        return False, {
            "message": "No faculty email address available.",
            "error": "No faculty email address available.",
            "sent": False
        }

    teacher_name = user.get_full_name() or user.first_name or user.username
    teacher_id = (profile.employee_id if profile else None) or (profile.user_id_code if profile else None) or f"TCH-{user.id:03d}"
    department = (profile.department if profile else None) or 'Academic Operations'
    designation = getattr(profile, 'designation', 'Faculty') or 'Faculty'

    is_live_smtp = bool(getattr(settings, 'EMAIL_HOST_USER', '') and getattr(settings, 'EMAIL_HOST_PASSWORD', ''))
    backend_name = getattr(settings, 'EMAIL_BACKEND', '')

    subject = f"Welcome to Smart Campus: Your Faculty / Teacher ID Details ({teacher_id})"
    plain_msg = (
        f"SMART CAMPUS ACADEMIC SUITE\n"
        f"FACULTY APPOINTMENT & CREDENTIAL NOTICE\n\n"
        f"Dear {teacher_name},\n\n"
        f"Welcome to the institution! Your faculty profile has been officially enrolled in the Smart Campus system.\n\n"
        f"YOUR OFFICIAL FACULTY CREDENTIAL DETAILS:\n"
        f"--------------------------------------------------\n"
        f"• Teacher / Employee ID: {teacher_id}\n"
        f"• Designation:           {designation}\n"
        f"• Department:            {department}\n"
        f"• Registered Email:      {user.email}\n"
        f"--------------------------------------------------\n\n"
        f"HOW TO LOG IN TO THE FACULTY PORTAL:\n"
        f"1. Open the Smart Campus portal login page.\n"
        f"2. Select the 'Faculty' tab.\n"
        f"3. Click 'Set Password with Teacher ID' (First time login).\n"
        f"4. Enter your Teacher ID: {teacher_id}\n"
        f"5. Create your new secure password and submit.\n"
        f"6. Once saved, you can log in anytime using your Teacher ID and chosen password!\n\n"
        f"FORGOT PASSWORD:\n"
        f"If you ever forget your password, click 'Forgot Password' on the login screen to receive a verification code at this email.\n\n"
        f"Office of Academic Affairs & Faculty Administration\n"
        f"Smart Campus Management System"
    )

    html_msg = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:20px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#0f172a; color:#f8fafc;">
      <div style="max-width:580px; margin:0 auto; background:#1e293b; border-radius:14px; border:1px solid #334155; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.4);">
        <div style="background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding:28px 32px; text-align:center;">
          <h2 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">👨‍🏫 Welcome to Smart Campus</h2>
          <p style="margin:6px 0 0; color:#e0e7ff; font-size:13px;">Official Faculty Appointment & Access Credentials</p>
        </div>
        <div style="padding:32px;">
          <p style="font-size:15px; color:#cbd5e1; margin:0 0 16px;">Dear <strong>{teacher_name}</strong>,</p>
          <p style="font-size:14px; color:#94a3b8; line-height:1.6; margin:0 0 20px;">
            Your faculty profile has been registered in the institution's system. Please use the following details to set your initial password and access the Faculty Academic Portal:
          </p>
          <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; padding:20px; margin-bottom:24px;">
            <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px; color:#cbd5e1;">
              <tr>
                <td width="38%" style="color:#94a3b8; font-weight:600;">Teacher ID:</td>
                <td><code style="background:#1e293b; color:#38bdf8; font-size:16px; font-weight:700; padding:3px 8px; border-radius:4px;">{teacher_id}</code></td>
              </tr>
              <tr>
                <td style="color:#94a3b8; font-weight:600;">Designation:</td>
                <td><strong style="color:#f8fafc;">{designation}</strong></td>
              </tr>
              <tr>
                <td style="color:#94a3b8; font-weight:600;">Department:</td>
                <td>{department}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8; font-weight:600;">Registered Email:</td>
                <td>{user.email}</td>
              </tr>
            </table>
          </div>
          <h3 style="font-size:15px; color:#f8fafc; margin:0 0 12px;">Next Steps to Sign In:</h3>
          <ol style="font-size:13.5px; color:#94a3b8; line-height:1.7; margin:0 0 24px; padding-left:20px;">
            <li>Go to the <strong style="color:#f8fafc;">Faculty Portal</strong> login screen.</li>
            <li>Click <strong style="color:#818cf8;">"Set Password with Teacher ID"</strong>.</li>
            <li>Enter your Teacher ID: <strong style="color:#38bdf8;">{teacher_id}</strong>.</li>
            <li>Create your new secure password and submit.</li>
            <li>Log in anytime using your Teacher ID and password!</li>
          </ol>
          <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0;">
            Note: If you ever forget your password, click "Forgot Password" on the login screen to receive a verification code at this email address.
          </p>
          <div style="border-top:1px solid #334155; margin-top:24px; padding-top:18px; font-size:12px; color:#64748b; text-align:center;">
            Office of Academic Affairs & Faculty Administration • Smart Campus System
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    from accounts.email_service import send_smart_email
    ok, mail_info = send_smart_email(
        subject=subject,
        plain_msg=plain_msg,
        recipient_list=[user.email.strip()],
        html_msg=html_msg
    )

    if ok:
        return True, {
            "message": mail_info.get("message", f"Teacher ID details successfully sent to {user.email}."),
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "email": user.email,
            "is_live_smtp": is_live_smtp or mail_info.get("is_live_smtp", False),
            "backend": mail_info.get("provider", backend_name),
            "subject": subject,
            "html_content": html_msg,
            "plain_text": plain_msg,
        }
    else:
        return False, {
            "message": mail_info.get("message", "Could not send onboarding email."),
            "error": mail_info.get("error", "Failed to dispatch email."),
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "email": user.email,
            "is_live_smtp": is_live_smtp,
            "backend": backend_name,
        }


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def set_student_password_view(request):
    """
    Allow students to set their password directly using their Student ID (or Roll Number).
    Stores user's password securely in database and activates the student account.
    Accepts: {
        "student_id": "STU20240001",
        "new_password": "...",
        "confirm_password": "...",
        "email": "..." (optional)
    }
    """
    ip = get_client_ip(request)
    raw_ident = (
        request.data.get('student_id') or
        request.data.get('identifier') or
        request.data.get('roll_no') or
        ''
    ).strip()
    new_password = (request.data.get('new_password') or '').strip()
    confirm_password = (request.data.get('confirm_password') or '').strip()
    email = (request.data.get('email') or '').strip().lower()

    if not raw_ident:
        return Response(
            {"detail": "Student ID is required to set your password."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not new_password or not confirm_password:
        return Response(
            {"detail": "Both new password and confirm password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    is_locked, rem_mins = LoginAttempt.is_locked_out(raw_ident, ip)
    if is_locked:
        return Response(
            {"detail": f"Too many attempts. Please try again in {rem_mins} minute(s)."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    if new_password != confirm_password:
        return Response(
            {"detail": "Passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 1. Resolve student by student_id, roll_no, or email
    student = (
        Student.objects.filter(student_id__iexact=raw_ident).first() or
        Student.objects.filter(roll_no__iexact=raw_ident).first()
    )
    if not student:
        clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
        for s in Student.objects.all():
            s_roll_clean = (s.roll_no or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            s_id_clean = (s.student_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            if clean_ident in (s_roll_clean, s_id_clean) or s_roll_clean == clean_ident or s_id_clean == clean_ident:
                student = s
                break

    profile = None
    user = None
    if student:
        if email and student.email and student.email.lower() != email:
            LoginAttempt.record_failure(raw_ident, ip)
            return Response(
                {"detail": "Provided email does not match institutional student record."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if hasattr(student, 'user_profile') and student.user_profile:
            profile = student.user_profile
            user = profile.user
        else:
            ident = (student.student_id or student.roll_no or f"STU{student.id}").strip()
            user, _ = User.objects.get_or_create(
                username=ident,
                defaults={"email": student.email or '', "first_name": student.name or ''}
            )
            profile, _ = UserProfile.objects.update_or_create(
                user=user,
                defaults={"role": "student", "student": student, "is_activated": False}
            )
    else:
        # Check if identifier matches a teacher account
        prof_teacher = UserProfile.objects.filter(employee_id__iexact=raw_ident, role='teacher').first()
        if not prof_teacher:
            clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
            for p in UserProfile.objects.filter(role='teacher').exclude(employee_id__isnull=True).exclude(employee_id=''):
                if (p.employee_id or '').replace('-', '').replace('_', '').replace(' ', '').upper() == clean_ident:
                    prof_teacher = p
                    break
        if prof_teacher:
            return set_teacher_password_view(request)

        user_obj = User.objects.filter(username__iexact=raw_ident).first()
        if user_obj and hasattr(user_obj, 'profile'):
            if user_obj.profile.role == 'teacher':
                return set_teacher_password_view(request)
            elif user_obj.profile.role == 'student':
                user = user_obj
                profile = user_obj.profile
                student = profile.student

    if not student or not profile:
        LoginAttempt.record_failure(raw_ident, ip)
        return Response(
            {"detail": f"No student account found with Student ID '{raw_ident}'. Please check your ID or contact your administrator."},
            status=status.HTTP_404_NOT_FOUND
        )

    # Prevent using student ID or roll number as password
    ident_clean = raw_ident.lower().replace('-', '').replace('_', '').replace(' ', '')
    pw_clean = new_password.lower().replace('-', '').replace('_', '').replace(' ', '')
    if ident_clean and (ident_clean in pw_clean or (len(pw_clean) >= 4 and pw_clean in ident_clean)):
        return Response(
            {"detail": "For security, your password cannot match or contain your Student ID or Roll Number."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate strong password requirements
    pw_errors = validate_strong_password(new_password, user=user)
    if pw_errors:
        return Response(
            {"detail": "Password does not meet security requirements: " + "; ".join(pw_errors), "errors": pw_errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Store hashed password in database and activate account
    user.set_password(new_password)
    user.is_active = True
    user.save()

    profile.is_activated = True
    profile.activation_token = None
    profile.activation_token_expires_at = None
    profile.must_change_password = False
    profile.clear_reset_otp()
    profile.save(update_fields=['is_activated', 'activation_token', 'activation_token_expires_at', 'must_change_password', 'reset_otp', 'reset_otp_expires_at'])

    LoginAttempt.record_success(raw_ident, ip)
    auth_token, _ = Token.objects.get_or_create(user=user)

    AuditLog.log(
        action='STUDENT_ACCOUNT_ACTIVATE',
        entity='Student',
        entity_id=str(user.id),
        description=f"Student '{user.username}' successfully set password with Student ID '{student.student_id}'.",
        user=user,
        request=request
    )

    return Response({
        "detail": "Password set successfully! Your account is now active and stored in the database.",
        "token": auth_token.key,
        "user_id": user.id,
        "user_id_code": profile.user_id_code,
        "username": user.username,
        "email": user.email,
        "role": profile.role,
        "name": user.get_full_name() or (student.name if student else user.username),
        "department": profile.department,
        "profile_pic": profile.profile_pic or (student.profile_photo if student else ""),
        "student": {
            "id": student.id,
            "name": student.name,
            "rollNo": student.roll_no or f"STU-2024-{student.id:03d}",
            "student_id": student.student_id or student.roll_no,
            "email": student.email,
            "phone": student.phone,
            "branch": student.branch,
            "year": student.year,
            "semester": student.semester,
            "profile_photo": student.profile_photo or profile.profile_pic,
        } if student else None
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def set_teacher_password_view(request):
    """
    Allow faculty/teachers to set their password directly using their Teacher ID (or Employee ID / Username / Email).
    Stores password securely in database and activates the faculty account.
    Accepts: {
        "teacher_id": "TCH-001",
        "new_password": "...",
        "confirm_password": "...",
        "email": "..." (optional)
    }
    """
    ip = get_client_ip(request)
    raw_ident = (
        request.data.get('teacher_id') or
        request.data.get('employee_id') or
        request.data.get('identifier') or
        request.data.get('username') or
        ''
    ).strip()
    new_password = (request.data.get('new_password') or '').strip()
    confirm_password = (request.data.get('confirm_password') or '').strip()
    email = (request.data.get('email') or '').strip().lower()

    if not raw_ident:
        return Response(
            {"detail": "Teacher ID is required to set your password."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not new_password or not confirm_password:
        return Response(
            {"detail": "Both new password and confirm password are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    is_locked, rem_mins = LoginAttempt.is_locked_out(raw_ident, ip)
    if is_locked:
        return Response(
            {"detail": f"Too many attempts. Please try again in {rem_mins} minute(s)."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    if new_password != confirm_password:
        return Response(
            {"detail": "Passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 1. Resolve teacher by employee_id, username, or email
    profile = UserProfile.objects.filter(employee_id__iexact=raw_ident, role='teacher').first()
    if not profile:
        clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
        for p in UserProfile.objects.filter(role='teacher').exclude(employee_id__isnull=True).exclude(employee_id=''):
            p_clean = (p.employee_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            if clean_ident == p_clean:
                profile = p
                break

    user = profile.user if profile else None
    if not user:
        user_match = User.objects.filter(username__iexact=raw_ident).first() or User.objects.filter(email__iexact=raw_ident).first()
        if user_match and hasattr(user_match, 'profile') and user_match.profile.role == 'teacher':
            user = user_match
            profile = user_match.profile

    if not profile or not user or profile.role != 'teacher':
        LoginAttempt.record_failure(raw_ident, ip)
        return Response(
            {"detail": f"No faculty account found with Teacher ID '{raw_ident}'. Please verify your Teacher ID or contact your administrator."},
            status=status.HTTP_404_NOT_FOUND
        )

    if email and user.email and user.email.lower() != email:
        LoginAttempt.record_failure(raw_ident, ip)
        return Response(
            {"detail": "Provided email does not match institutional faculty records."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Prevent using teacher ID or username as password
    ident_clean = raw_ident.lower().replace('-', '').replace('_', '').replace(' ', '')
    pw_clean = new_password.lower().replace('-', '').replace('_', '').replace(' ', '')
    if ident_clean and (ident_clean in pw_clean or (len(pw_clean) >= 4 and pw_clean in ident_clean)):
        return Response(
            {"detail": "For security, your password cannot match or contain your Teacher ID."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate strong password requirements
    pw_errors = validate_strong_password(new_password, user=user)
    if pw_errors:
        return Response(
            {"detail": "Password does not meet security requirements: " + "; ".join(pw_errors), "errors": pw_errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Store hashed password in database and activate account
    user.set_password(new_password)
    user.is_active = True
    user.save()

    profile.is_activated = True
    profile.activation_token = None
    profile.activation_token_expires_at = None
    profile.must_change_password = False
    profile.clear_reset_otp()
    profile.save(update_fields=['is_activated', 'activation_token', 'activation_token_expires_at', 'must_change_password', 'reset_otp', 'reset_otp_expires_at'])

    LoginAttempt.record_success(raw_ident, ip)
    auth_token, _ = Token.objects.get_or_create(user=user)

    AuditLog.log(
        action='TEACHER_ACCOUNT_ACTIVATE',
        entity='User',
        entity_id=str(user.id),
        description=f"Faculty '{user.username}' successfully set password with Teacher ID '{profile.user_id_code}'.",
        user=user,
        request=request
    )

    return Response({
        "detail": "Password set successfully! Your faculty account is now active and stored in the database.",
        "token": auth_token.key,
        "user_id": user.id,
        "user_id_code": profile.user_id_code,
        "employee_id": profile.employee_id,
        "username": user.username,
        "email": user.email,
        "role": profile.role,
        "name": user.get_full_name() or user.first_name or user.username,
        "department": profile.department,
        "designation": getattr(profile, 'designation', 'Faculty'),
        "qualification": getattr(profile, 'qualification', ''),
        "profile_pic": profile.profile_pic,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAdmin])
def register_faculty_view(request):
    """
    Register a new faculty / teacher in the system with full faculty form details.
    Generates a unique Teacher ID (TCH-...), stores account in database, sets account as
    awaiting password setup (unusable initial password), and dispatches Teacher ID onboarding email.
    Accepts: {
        "name": "Dr. Ramesh Sharma",
        "email": "ramesh.sharma@gmail.com",
        "phone": "9876543210",
        "department": "Computer Science & Engineering",
        "designation": "Associate Professor",
        "qualification": "Ph.D in AI & Machine Learning",
        "teacher_id": "TCH-005" (optional),
        "profile_photo": "data:image/jpeg;base64,..." (optional)
    }
    """
    raw_name = (request.data.get('name') or request.data.get('full_name') or '').strip()
    email = (request.data.get('email') or '').strip().lower()
    phone = (request.data.get('phone') or '').strip()
    raw_department = (request.data.get('department') or '').strip()
    designation = (request.data.get('designation') or 'Faculty').strip()
    qualification = (request.data.get('qualification') or '').strip()
    custom_teacher_id = (request.data.get('teacher_id') or request.data.get('employee_id') or '').strip().upper()
    profile_photo = (request.data.get('profile_photo') or request.data.get('profile_pic') or '').strip()

    if not raw_name:
        return Response({"detail": "Faculty name is required."}, status=status.HTTP_400_BAD_REQUEST)

    if not email:
        return Response({"detail": "Email address is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_email(email)
    except ValidationError:
        return Response({"detail": "Please enter a valid email address format."}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email__iexact=email).exists():
        return Response({"detail": f"A user with email '{email}' already exists in the system."}, status=status.HTTP_400_BAD_REQUEST)

    # Department normalization
    norm_department = DEPARTMENT_MAP.get(raw_department.upper(), raw_department)
    if norm_department not in COLLEGE_DEPARTMENTS:
        department = COLLEGE_DEPARTMENTS[0] if not raw_department else norm_department
    else:
        department = norm_department

    # Resolve Teacher ID
    if custom_teacher_id:
        if not custom_teacher_id.startswith('TCH'):
            clean_body = custom_teacher_id.replace('-', '').strip()
            custom_teacher_id = f"TCH-{clean_body}"
        if UserProfile.objects.filter(employee_id__iexact=custom_teacher_id).exists():
            return Response(
                {"detail": f"Teacher ID '{custom_teacher_id}' is already in use. Please choose another ID or leave blank to auto-generate."},
                status=status.HTTP_400_BAD_REQUEST
            )
        assigned_teacher_id = custom_teacher_id
    else:
        cnt = User.objects.count() + 1
        candidate = f"TCH-{cnt:03d}"
        while UserProfile.objects.filter(employee_id__iexact=candidate).exists():
            cnt += 1
            candidate = f"TCH-{cnt:03d}"
        assigned_teacher_id = candidate

    # Generate a unique username based on teacher ID
    base_user = assigned_teacher_id.lower().replace('-', '')
    username = base_user
    u_cnt = 1
    while User.objects.filter(username__iexact=username).exists():
        username = f"{base_user}{u_cnt}"
        u_cnt += 1

    parts = raw_name.split(' ', 1)
    first_name = parts[0]
    last_name = parts[1] if len(parts) > 1 else ''

    user = User.objects.create(
        username=username,
        email=email,
        first_name=first_name,
        last_name=last_name,
        is_active=True
    )
    user.set_unusable_password()
    user.save()

    profile, _ = UserProfile.objects.update_or_create(
        user=user,
        defaults={
            "role": "teacher",
            "department": department,
            "designation": designation,
            "qualification": qualification,
            "phone": phone,
            "employee_id": assigned_teacher_id,
            "profile_pic": profile_photo,
            "is_activated": False,
        }
    )
    profile.generate_activation_token()

    # Automatically dispatch onboarding email with Teacher ID asynchronously
    import threading
    t = threading.Thread(target=send_teacher_onboarding_email, args=(user,))
    t.daemon = True
    t.start()

    log_user = request.user if (request.user and request.user.is_authenticated) else user
    AuditLog.log(
        action='TEACHER_CREATE',
        entity='User',
        entity_id=str(user.id),
        description=f"Faculty '{raw_name}' enrolled with Teacher ID '{assigned_teacher_id}' in department '{department}'.",
        user=log_user,
        request=request
    )

    return Response({
        "detail": f"Faculty '{raw_name}' registered successfully! Assigned Teacher ID: {assigned_teacher_id}. Teacher ID details and password setup instructions sent to {email}.",
        "teacher_id": assigned_teacher_id,
        "employee_id": assigned_teacher_id,
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
        "name": raw_name,
        "department": department,
        "designation": designation,
        "qualification": qualification,
        "phone": phone,
        "is_activated": False
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def send_teacher_credentials_view(request, user_id):
    """
    Admin or faculty lead re-sends the official Teacher ID details and password setup instructions to the teacher's email.
    """
    user = get_object_or_404(User, pk=user_id)
    if not user.email:
        return Response(
            {"detail": "This faculty member does not have an email address on file.", "sent": False},
            status=status.HTTP_400_BAD_REQUEST
        )

    ok, res_data = send_teacher_onboarding_email(user)
    profile = getattr(user, 'profile', None)
    teacher_id = (profile.employee_id if profile else None) or (profile.user_id_code if profile else None) or f"TCH-{user.id:03d}"

    AuditLog.log(
        action='TEACHER_CREDENTIALS_DISPATCH',
        entity='User',
        entity_id=str(user.id),
        description=f"User '{request.user.username}' sent Teacher ID '{teacher_id}' details email to '{user.email}' (Success: {ok}).",
        user=request.user,
        request=request
    )

    if not ok:
        return Response(
            {
                "detail": f"Failed to send email: {res_data.get('message', 'Unknown error')}",
                "error": res_data.get("error", "Dispatch failed"),
                "email": user.email,
                "sent": False,
                "teacher_id": teacher_id
            },
            status=status.HTTP_502_BAD_GATEWAY
        )

    return Response(
        {
            "detail": res_data.get("message", f"Teacher ID details successfully sent to {user.email}."),
            "sent": True,
            "email": user.email,
            "teacher_id": teacher_id,
            "info": res_data
        },
        status=status.HTTP_200_OK
    )


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def forgot_password_view(request):
    """
    Initiate password reset: Look up student by Student ID or registered email,
    generate a 6-digit OTP code, and send it to their respective email.
    Accepts: { "identifier": "STU20240001" | "student@gmail.com" }
    """
    ip = get_client_ip(request)
    raw_ident = (request.data.get('identifier') or request.data.get('email') or request.data.get('student_id') or '').strip()

    if not raw_ident:
        return Response(
            {"detail": "Please enter your Student ID, Roll Number, or registered Email address."},
            status=status.HTTP_400_BAD_REQUEST
        )

    is_locked, rem_mins = LoginAttempt.is_locked_out(raw_ident, ip)
    if is_locked:
        return Response(
            {"detail": f"Too many requests. Please wait {rem_mins} minute(s) before trying again."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    # 1. Resolve student and user
    student = (
        Student.objects.filter(student_id__iexact=raw_ident).first() or
        Student.objects.filter(roll_no__iexact=raw_ident).first() or
        Student.objects.filter(email__iexact=raw_ident).first()
    )
    if not student:
        clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
        for s in Student.objects.all():
            s_roll_clean = (s.roll_no or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            s_id_clean = (s.student_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            if clean_ident in (s_roll_clean, s_id_clean) or s_roll_clean == clean_ident or s_id_clean == clean_ident:
                student = s
                break

    user = None
    profile = None
    if student:
        if hasattr(student, 'user_profile') and student.user_profile:
            profile = student.user_profile
            user = profile.user
        else:
            ident = (student.student_id or student.roll_no or f"STU{student.id}").strip()
            user, _ = User.objects.get_or_create(
                username=ident,
                defaults={"email": student.email or '', "first_name": student.name or ''}
            )
            profile, _ = UserProfile.objects.update_or_create(
                user=user,
                defaults={"role": "student", "student": student, "is_activated": False}
            )
    else:
        # Check by Teacher / Employee ID
        prof_match = UserProfile.objects.filter(employee_id__iexact=raw_ident).first()
        if not prof_match:
            clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
            for p in UserProfile.objects.exclude(employee_id__isnull=True).exclude(employee_id=''):
                if (p.employee_id or '').replace('-', '').replace('_', '').replace(' ', '').upper() == clean_ident:
                    prof_match = p
                    break
        if prof_match:
            user = prof_match.user
            profile = prof_match
            student = getattr(profile, 'student', None)
        else:
            user_match = User.objects.filter(username__iexact=raw_ident).first() or User.objects.filter(email__iexact=raw_ident).first()
            if user_match:
                user = user_match
                profile = getattr(user, 'profile', None)
                student = getattr(profile, 'student', None) if profile else None

    if not profile or not user:
        LoginAttempt.record_failure(raw_ident, ip)
        return Response(
            {"detail": "No account found matching this Student ID or email. Please verify and try again."},
            status=status.HTTP_404_NOT_FOUND
        )

    recipient_email = (student.email if student and student.email else user.email or '').strip()
    if not recipient_email:
        return Response(
            {"detail": "No email address is registered on file for this account. Please contact the administrator."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # 2. Generate 6-digit OTP
    otp = profile.generate_reset_otp(minutes=15)
    masked = mask_email(recipient_email)
    student_name = student.name if student else (user.get_full_name() or user.username)
    student_id_disp = (student.student_id or student.roll_no) if student else user.username

    # 3. Send official password reset email
    subject = f"🔐 Password Reset Verification Code: {otp} - Smart Campus"
    plain_msg = (
        f"Smart Campus Academic Portal - Password Reset Request\n\n"
        f"Dear {student_name},\n\n"
        f"We received a request to reset your password for Student ID: {student_id_disp}.\n\n"
        f"Your 6-digit verification code is:\n"
        f"-----------------------------------------\n"
        f"   {otp}\n"
        f"-----------------------------------------\n\n"
        f"This code will expire in 15 minutes.\n"
        f"Enter this code on the password reset screen to create your new password.\n\n"
        f"If you did not request this, please ignore this email or contact support.\n\n"
        f"Office of Academic Affairs\n"
        f"Smart Campus Portal"
    )

    html_msg = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0; padding:20px; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#0f172a; color:#f8fafc;">
      <div style="max-width:540px; margin:0 auto; background:#1e293b; border-radius:14px; border:1px solid #334155; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.4);">
        <div style="background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding:28px 32px; text-align:center;">
          <h2 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">🔐 Password Reset Request</h2>
          <p style="margin:6px 0 0; color:#e0e7ff; font-size:13px;">Smart Campus Student Management Portal</p>
        </div>
        <div style="padding:32px;">
          <p style="font-size:15px; color:#cbd5e1; margin:0 0 16px;">Hello <strong>{student_name}</strong>,</p>
          <p style="font-size:14px; color:#94a3b8; line-height:1.6; margin:0 0 24px;">
            We received a request to reset the password for your account associated with Student ID <strong style="color:#f8fafc;">{student_id_disp}</strong>.
            Use the 6-digit verification code below to reset your password:
          </p>
          <div style="background:#0f172a; border:2px dashed #6366f1; border-radius:12px; padding:20px; text-align:center; margin-bottom:24px;">
            <span style="font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; display:block; margin-bottom:6px;">Your 6-Digit Verification Code</span>
            <span style="font-size:36px; font-weight:800; color:#38bdf8; letter-spacing:8px; font-family:monospace;">{otp}</span>
            <div style="font-size:12px; color:#a5b4fc; margin-top:8px;">⏱ Valid for 15 minutes</div>
          </div>
          <p style="font-size:13px; color:#64748b; line-height:1.5; margin:0 0 20px;">
            If you did not initiate this request, you can safely ignore this email. Your current password remains active and secure.
          </p>
          <div style="border-top:1px solid #334155; padding-top:18px; font-size:12px; color:#64748b; text-align:center;">
            Office of Academic Affairs • Smart Campus System
          </div>
        </div>
      </div>
    </body>
    </html>
    """

    from accounts.email_service import send_smart_email
    email_sent, mail_info = send_smart_email(
        subject=subject,
        plain_msg=plain_msg,
        recipient_list=[recipient_email],
        html_msg=html_msg
    )

    AuditLog.log(
        action='PASSWORD_RESET_REQUEST',
        entity='Student',
        entity_id=str(user.id),
        description=f"Password reset OTP generated for student '{user.username}' and sent to '{recipient_email}'.",
        request=request
    )

    return Response({
        "detail": f"Password reset verification code has been sent to your registered email ({masked}).",
        "email_masked": masked,
        "identifier": student_id_disp,
        "student_id": student_id_disp,
        "email_sent": email_sent,
        "dev_otp": otp if (settings.DEBUG or not getattr(settings, 'EMAIL_HOST_USER', '')) else None
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def reset_password_view(request):
    """
    Complete password reset: Verify 6-digit OTP code and set user's new password.
    Accepts: {
        "identifier": "STU20240001",
        "otp": "482915",
        "new_password": "...",
        "confirm_password": "..."
    }
    """
    ip = get_client_ip(request)
    raw_ident = (request.data.get('identifier') or request.data.get('student_id') or request.data.get('email') or '').strip()
    otp = (request.data.get('otp') or request.data.get('code') or '').strip()
    new_password = (request.data.get('new_password') or '').strip()
    confirm_password = (request.data.get('confirm_password') or '').strip()

    if not raw_ident or not otp or not new_password or not confirm_password:
        return Response(
            {"detail": "Identifier (Student ID/Email), 6-digit OTP, new password, and confirmation are all required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    is_locked, rem_mins = LoginAttempt.is_locked_out(raw_ident, ip)
    if is_locked:
        return Response(
            {"detail": f"Too many attempts. Please try again in {rem_mins} minute(s)."},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    if new_password != confirm_password:
        return Response(
            {"detail": "New passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Locate student & user
    student = (
        Student.objects.filter(student_id__iexact=raw_ident).first() or
        Student.objects.filter(roll_no__iexact=raw_ident).first() or
        Student.objects.filter(email__iexact=raw_ident).first()
    )
    if not student:
        clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
        for s in Student.objects.all():
            s_roll_clean = (s.roll_no or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            s_id_clean = (s.student_id or '').replace('-', '').replace('_', '').replace(' ', '').upper()
            if clean_ident in (s_roll_clean, s_id_clean) or s_roll_clean == clean_ident or s_id_clean == clean_ident:
                student = s
                break

    user = None
    profile = None
    if student and hasattr(student, 'user_profile') and student.user_profile:
        profile = student.user_profile
        user = profile.user
    else:
        # Check by Teacher / Employee ID
        prof_match = UserProfile.objects.filter(employee_id__iexact=raw_ident).first()
        if not prof_match:
            clean_ident = raw_ident.replace('-', '').replace('_', '').replace(' ', '').upper()
            for p in UserProfile.objects.exclude(employee_id__isnull=True).exclude(employee_id=''):
                if (p.employee_id or '').replace('-', '').replace('_', '').replace(' ', '').upper() == clean_ident:
                    prof_match = p
                    break
        if prof_match:
            user = prof_match.user
            profile = prof_match
            student = getattr(profile, 'student', None)
        else:
            user_match = User.objects.filter(username__iexact=raw_ident).first() or User.objects.filter(email__iexact=raw_ident).first()
            if user_match:
                user = user_match
                profile = getattr(user, 'profile', None)
                student = getattr(profile, 'student', None) if profile else None

    if not profile or not user:
        LoginAttempt.record_failure(raw_ident, ip)
        return Response(
            {"detail": "No account found matching this identifier."},
            status=status.HTTP_404_NOT_FOUND
        )

    # Verify OTP
    if not profile.is_reset_otp_valid(otp):
        LoginAttempt.record_failure(raw_ident, ip)
        return Response(
            {"detail": "Invalid or expired 6-digit verification code. Please request a new code."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Disallow student ID / username as password
    ident_clean = raw_ident.lower().replace('-', '').replace('_', '').replace(' ', '')
    pw_clean = new_password.lower().replace('-', '').replace('_', '').replace(' ', '')
    if ident_clean and (ident_clean in pw_clean or (len(pw_clean) >= 4 and pw_clean in ident_clean)):
        return Response(
            {"detail": "Password cannot match or contain your Student ID or username."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Validate strong password
    pw_errors = validate_strong_password(new_password, user=user)
    if pw_errors:
        return Response(
            {"detail": "Password does not meet security requirements: " + "; ".join(pw_errors), "errors": pw_errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Set password & clear reset OTP
    user.set_password(new_password)
    user.is_active = True
    user.save()

    profile.is_activated = True
    profile.must_change_password = False
    profile.clear_reset_otp()
    profile.save(update_fields=['is_activated', 'must_change_password', 'reset_otp', 'reset_otp_expires_at'])

    LoginAttempt.record_success(raw_ident, ip)
    auth_token, _ = Token.objects.get_or_create(user=user)

    AuditLog.log(
        action='PASSWORD_RESET_SUCCESS',
        entity='User',
        entity_id=str(user.id),
        description=f"User '{user.username}' successfully reset password via email OTP verification.",
        user=user,
        request=request
    )

    return Response({
        "detail": "Password reset successfully! You can now log in with your Student ID and new password.",
        "token": auth_token.key,
        "user_id": user.id,
        "username": user.username,
        "role": profile.role,
        "student_id": (student.student_id or student.roll_no) if student else user.username,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def activate_student_account(request):
    """
    Activate a student account using student ID and password, or token.
    Accepts: {
        "identifier": "...", # Roll number, Student ID, username, or email
        "activation_token": "..." (optional),
        "new_password": "...",
        "confirm_password": "..."
    }
    """
    ip = get_client_ip(request)
    identifier = (request.data.get('identifier') or request.data.get('student_id') or '').strip()
    token = (request.data.get('activation_token') or '').strip()
    new_password = (request.data.get('new_password') or '').strip()
    confirm_password = (request.data.get('confirm_password') or '').strip()

    if not identifier or not new_password or not confirm_password:
        return Response(
            {"detail": "Student identifier, new password, and confirm password are all required."},
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

    # Validate token if token was supplied
    if token:
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
    profile.clear_reset_otp()
    profile.save(update_fields=['is_activated', 'activation_token', 'activation_token_expires_at', 'must_change_password', 'reset_otp', 'reset_otp_expires_at'])

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
            "student_id": s.student_id or s.roll_no,
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

        if role == 'teacher':
            try:
                import threading
                t = threading.Thread(target=send_teacher_onboarding_email, args=(user,))
                t.daemon = True
                t.start()
            except Exception as e:
                print(f"[manage_users_view] Teacher onboarding email dispatch note: {e}")

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


@api_view(['DELETE'])
@permission_classes([IsAdmin])
def delete_user_view(request, user_id):
    """
    Admin-only endpoint to permanently delete a system user (faculty / teacher or admin).
    """
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    # Prevent deleting oneself
    if user.id == request.user.id:
        return Response({"detail": "You cannot delete your own administrative account."}, status=status.HTTP_400_BAD_REQUEST)

    # Prevent non-superusers from deleting superusers
    if user.is_superuser and not request.user.is_superuser:
        return Response({"detail": "Only a superuser can delete another superuser account."}, status=status.HTTP_403_FORBIDDEN)

    profile = getattr(user, 'profile', None)
    role = profile.role if profile else ('admin' if user.is_superuser else 'teacher')
    username = user.username
    full_name = user.get_full_name() or user.first_name or username
    user_id_code = profile.user_id_code if profile else f"USR-{user.id:03d}"

    # If linked to a Student record, dissociate student
    if profile and profile.student:
        try:
            profile.student = None
            profile.save(update_fields=['student'])
        except Exception:
            pass

    # Defensively nullify any unmanaged fee references before deleting user
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("UPDATE fees_feepayment SET collected_by_id = NULL WHERE collected_by_id = %s", [user_id])
            cursor.execute("UPDATE fees_feepayment SET verified_by_id = NULL WHERE verified_by_id = %s", [user_id])
            cursor.execute("UPDATE fees_studentfeerecord SET cleared_by_id = NULL WHERE cleared_by_id = %s", [user_id])
            cursor.execute("UPDATE fees_feecategory SET created_by_id = NULL WHERE created_by_id = %s", [user_id])
            cursor.execute("UPDATE fees_feestructure SET created_by_id = NULL WHERE created_by_id = %s", [user_id])
    except Exception as fee_err:
        print(f"[delete_user_view] Unmanaged fee cleanup note: {fee_err}")

    # Permanently delete the user from database
    user.delete()

    action_name = 'TEACHER_DELETE' if role == 'teacher' else 'USER_DELETE'
    AuditLog.log(
        action=action_name,
        entity='User',
        entity_id=str(user_id),
        description=f"Admin '{request.user.username}' permanently deleted {role} '{full_name}' ({user_id_code}) from database records.",
        user=request.user,
        request=request
    )

    return Response({
        "success": True,
        "message": f"{role.capitalize()} '{full_name}' ({user_id_code}) permanently deleted from database records."
    }, status=status.HTTP_200_OK)


