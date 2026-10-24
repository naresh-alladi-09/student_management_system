import os
import django
import sys

# Setup django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_config.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate
from accounts.models import UserProfile
from accounts.views import register_faculty_view, manage_users_view
from attendance.views import create_attendance_session, bulk_save_attendance
from timetable.views import start_attendance_from_slot
from performance.models import Subject
from students.models import FacultyAssignment, AcademicClass, Branch, Department
from timetable.models import TimetableSlot

def run_security_tests():
    print("=== STARTING SECURITY & ROLE PERMISSION VERIFICATION ===")

    factory = APIRequestFactory()

    # 1. SETUP USERS
    # Admin user
    admin_user, _ = User.objects.get_or_create(username='test_admin_user', defaults={'is_staff': True, 'email': 'admin@test.com'})
    admin_profile, _ = UserProfile.objects.get_or_create(user=admin_user, defaults={'role': 'admin', 'is_activated': True})
    admin_profile.role = 'admin'
    admin_profile.save()

    # Regular faculty user A
    faculty_a, _ = User.objects.get_or_create(username='prof_alice', defaults={'email': 'alice@test.com'})
    faculty_a_profile, _ = UserProfile.objects.get_or_create(user=faculty_a, defaults={'role': 'teacher', 'is_activated': True})
    faculty_a_profile.role = 'teacher'
    faculty_a_profile.save()

    # Regular faculty user B
    faculty_b, _ = User.objects.get_or_create(username='prof_bob', defaults={'email': 'bob@test.com'})
    faculty_b_profile, _ = UserProfile.objects.get_or_create(user=faculty_b, defaults={'role': 'teacher', 'is_activated': True})
    faculty_b_profile.role = 'teacher'
    faculty_b_profile.save()

    # Student user
    student_user, _ = User.objects.get_or_create(username='stu_charlie', defaults={'email': 'charlie@test.com'})
    student_profile, _ = UserProfile.objects.get_or_create(user=student_user, defaults={'role': 'student', 'is_activated': True})
    student_profile.role = 'student'
    student_profile.save()

    # Department, Branch, AcademicClass
    dept, _ = Department.objects.get_or_create(code='ENG', defaults={'name': 'Engineering'})
    branch, _ = Branch.objects.get_or_create(code='CSE', defaults={'department': dept, 'name': 'Computer Science'})
    ac_class, _ = AcademicClass.objects.get_or_create(branch=branch, year=3, semester=1, section='A')

    # Create two subjects
    subj_math, _ = Subject.objects.get_or_create(code='MATH101', defaults={'name': 'Calculus', 'credits': 4})
    subj_phys, _ = Subject.objects.get_or_create(code='PHYS101', defaults={'name': 'Physics', 'credits': 4})

    # Assign Calculus to prof_alice only
    FacultyAssignment.objects.filter(teacher=faculty_a, subject=subj_math).delete()
    FacultyAssignment.objects.create(teacher=faculty_a, subject=subj_math, academic_class=ac_class)

    # Ensure prof_bob does NOT have Calculus
    FacultyAssignment.objects.filter(teacher=faculty_b, subject=subj_math).delete()


    # --- TEST 1: FACULTY CANNOT CREATE OTHER FACULTY ACCOUNTS ---
    print("\n[TEST 1] Faculty attempts to create a faculty account:")
    req = factory.post('/api/accounts/register-faculty/', {
        'username': 'unauthorized_fac',
        'password': 'Password123!',
        'email': 'unauth@test.com',
        'name': 'Unauthorized'
    }, format='json')
    force_authenticate(req, user=faculty_a)
    resp = register_faculty_view(req)
    print(f"Status: {resp.status_code} (Expected: 403 Forbidden)")
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print("VERIFIED: Non-admin faculty blocked from creating faculty accounts!")

    print("\n[TEST 1B] Student attempts to create a faculty account:")
    force_authenticate(req, user=student_user)
    resp = register_faculty_view(req)
    print(f"Status: {resp.status_code} (Expected: 403 Forbidden)")
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print("VERIFIED: Student blocked from creating faculty accounts!")

    print("\n[TEST 1C] Faculty attempts to create user via manage-users:")
    req = factory.post('/api/accounts/manage-users/', {
        'username': 'unauthorized_fac2',
        'password': 'Password123!',
        'role': 'faculty'
    }, format='json')
    force_authenticate(req, user=faculty_a)
    resp = manage_users_view(req)
    print(f"Status: {resp.status_code} (Expected: 403 Forbidden)")
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
    print("VERIFIED: Faculty blocked from creating users via manage-users!")


    # --- TEST 2: ATTENDANCE MUST BE TAKEN BY RESPECTIVE SUBJECT FACULTY ---
    print("\n[TEST 2A] Faculty B (Prof. Bob) tries to start attendance for Calculus (Assigned to Alice):")
    req_2a = factory.post('/api/attendance/create-session/', {
        'subject_id': subj_math.id,
        'branch': 'CSE',
        'require_geo': False,
        'require_face': False,
        'duration_seconds': 120
    }, format='json')
    force_authenticate(req_2a, user=faculty_b)
    resp_2a = create_attendance_session(req_2a)
    print(f"Status: {resp_2a.status_code} (Expected: 403 Forbidden)")
    print(f"Response: {resp_2a.data}")
    assert resp_2a.status_code == 403, f"Expected 403, got {resp_2a.status_code}"
    print("VERIFIED: Faculty B blocked from starting session for subject they do not teach!")

    print("\n[TEST 2B] Faculty A (Prof. Alice) starts attendance for Calculus (Assigned to Alice):")
    req_2b = factory.post('/api/attendance/create-session/', {
        'subject_id': subj_math.id,
        'branch': 'CSE',
        'require_geo': False,
        'require_face': False,
        'duration_seconds': 120
    }, format='json')
    force_authenticate(req_2b, user=faculty_a)
    resp_2b = create_attendance_session(req_2b)
    print(f"Status: {resp_2b.status_code} (Expected: 201 Created)")
    assert resp_2b.status_code == 201, f"Expected 201, got {resp_2b.status_code}"
    print("VERIFIED: Faculty A permitted to start session for Calculus!")

    print("\n[TEST 2C] Faculty B tries bulk manual attendance for Calculus:")
    req_2c = factory.post('/api/attendance/bulk-save/', {
        'date': '2026-10-23',
        'subject_id': subj_math.id,
        'attendance': {}
    }, format='json')
    force_authenticate(req_2c, user=faculty_b)
    resp_2c = bulk_save_attendance(req_2c)
    print(f"Status: {resp_2c.status_code} (Expected: 403 Forbidden)")
    print(f"Response: {resp_2c.data}")
    assert resp_2c.status_code == 403, f"Expected 403, got {resp_2c.status_code}"
    print("VERIFIED: Faculty B blocked from bulk manual attendance for subject they do not teach!")

    print("\n[TEST 2D] Faculty A performs bulk manual attendance for Calculus:")
    req_2d = factory.post('/api/attendance/bulk-save/', {
        'date': '2026-10-23',
        'subject_id': subj_math.id,
        'attendance': {}
    }, format='json')
    force_authenticate(req_2d, user=faculty_a)
    resp_2d = bulk_save_attendance(req_2d)
    print(f"Status: {resp_2d.status_code} (Expected: 200 OK)")
    assert resp_2d.status_code == 200, f"Expected 200, got {resp_2d.status_code}"
    print("VERIFIED: Faculty A permitted to save manual attendance for Calculus!")

    print("\n=== ALL SECURITY AND ROLE VERIFICATIONS PASSED 100%! ===")

if __name__ == "__main__":
    run_security_tests()
