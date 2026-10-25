import os
import django
from datetime import datetime, time, date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_config.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone

from students.models import Student, AcademicClass, Branch, Department
from attendance.models import AttendanceSession, AttendanceRecord
from timetable.models import TimetableSlot
from performance.models import Subject

User = get_user_model()

def run_tests():
    print("======================================================================")
    print(" TESTING: STUDENT ATTENDANCE ONLY MARKED ONCE PER PERIOD POLICY")
    print("======================================================================")

    client = APIClient()

    # 1. Setup entities
    dept, _ = Department.objects.get_or_create(name="Computer Engineering", code="CE")
    branch, _ = Branch.objects.get_or_create(name="Computer Engineering", code="CE", department=dept)
    academic_class, _ = AcademicClass.objects.get_or_create(
        branch=branch, year=2, semester=3, section="A"
    )

    subject1, _ = Subject.objects.get_or_create(
        code="CE301", defaults={"name": "Data Structures", "branch": "CE", "semester": "3", "credits": 4}
    )
    subject2, _ = Subject.objects.get_or_create(
        code="CE302", defaults={"name": "Computer Networks", "branch": "CE", "semester": "3", "credits": 4}
    )

    from accounts.models import UserProfile

    teacher_user, _ = User.objects.get_or_create(username="period_teacher", defaults={"email": "pt@test.edu", "is_staff": True})
    teacher_user.set_password("Teacher@123")
    teacher_user.save()
    UserProfile.objects.update_or_create(user=teacher_user, defaults={"role": "teacher"})

    student_user, _ = User.objects.get_or_create(username="period_student", defaults={"email": "ps@test.edu"})
    student_user.set_password("Student@123")
    student_user.save()

    student_obj, _ = Student.objects.get_or_create(
        roll_no="STU-PERIOD-001",
        defaults={
            "name": "Jordan Student",
            "branch": "CE",
            "year": 2,
            "semester": "3",
            "section": "A",
            "academic_class": academic_class,
            "face_registered": False,
        }
    )
    UserProfile.objects.filter(user=student_user).delete()
    UserProfile.objects.filter(student=student_obj).delete()
    UserProfile.objects.create(user=student_user, student=student_obj, role="student")

    now_local = timezone.localtime()
    today_date = now_local.date()
    today_day = now_local.strftime('%A')

    # Cleanup old test records for this student on today_date
    AttendanceRecord.objects.filter(student=student_obj, date=today_date).delete()
    TimetableSlot.objects.filter(academic_class=academic_class, day=today_day).delete()

    # Create 2 scheduled periods on today's timetable:
    # Period 1: active right now (started 20 mins ago, ends 30 mins in future)
    # Period 2: future slot (starts 35 mins in future, ends 85 mins in future)
    p1_start = (now_local - timedelta(minutes=20)).time()
    p1_end = (now_local + timedelta(minutes=30)).time()

    p2_start = (now_local + timedelta(minutes=35)).time()
    p2_end = (now_local + timedelta(minutes=85)).time()

    slot1 = TimetableSlot.objects.create(
        subject=subject1,
        teacher=teacher_user,
        academic_class=academic_class,
        branch="CE",
        year=2,
        semester="3",
        section="A",
        day=today_day,
        start_time=p1_start,
        end_time=p1_end,
        room="Room 201"
    )

    slot2 = TimetableSlot.objects.create(
        subject=subject2,
        teacher=teacher_user,
        academic_class=academic_class,
        branch="CE",
        year=2,
        semester="3",
        section="A",
        day=today_day,
        start_time=p2_start,
        end_time=p2_end,
        room="Room 202"
    )

    print(f"Created Timetable Period 1: {slot1}")
    print(f"Created Timetable Period 2: {slot2}")

    # =========================================================================
    # TEST 1: Launch Session 1A for Period 1
    # =========================================================================
    print("\n--- TEST 1: Mark Attendance in Period 1 ---")
    session_1a = AttendanceSession.create_session(
        subject=subject1,
        teacher=teacher_user,
        academic_class=academic_class,
        timetable_slot=slot1,
        section="A",
        end_time=p1_end,
        duration_seconds=300,
        require_face=False,
        require_geo=False
    )
    session_1a.start_time = p1_start
    session_1a.save(update_fields=['start_time'])

    client.force_authenticate(user=student_user)

    # Verify token should indicate not yet marked
    v_res = client.get(f"/api/attendance/sessions/verify-token/?token={session_1a.qr_token}")
    assert v_res.status_code == 200
    assert v_res.data['is_already_marked'] == False
    print("Verify Token indicates attendance NOT yet marked for Period 1. (PASS)")

    # Mark attendance for Session 1A
    mark_res = client.post("/api/attendance/mark-qr/", {
        "qr_token": session_1a.qr_token,
        "ignore_timetable": True
    }, format="json")
    if mark_res.status_code not in [200, 201]:
        print("Mark Error Status:", mark_res.status_code, mark_res.data)
    assert mark_res.status_code in [200, 201]
    assert mark_res.data['status'] == 'Present'
    print(f"Student marked PRESENT for Period 1 ({session_1a.get_period_label()}). (PASS)")

    # =========================================================================
    # TEST 2: Re-marking same session 1A must be rejected (409)
    # =========================================================================
    print("\n--- TEST 2: Re-marking Attendance for Same Session 1A ---")
    dup_res = client.post("/api/attendance/mark-qr/", {
        "qr_token": session_1a.qr_token,
        "ignore_timetable": True
    }, format="json")
    assert dup_res.status_code == 409
    assert dup_res.data['already_marked'] == True
    print(f"Rejected with 409: '{dup_res.data['detail']}' (PASS)")

    # =========================================================================
    # TEST 3: Teacher starts Session 1B during the SAME Period 1 (e.g. refreshed/re-opened)
    # =========================================================================
    print("\n--- TEST 3: Teacher starts Session 1B in SAME Period 1. Student attempts second check-in ---")
    session_1b = AttendanceSession.create_session(
        subject=subject1,
        teacher=teacher_user,
        academic_class=academic_class,
        timetable_slot=slot1,
        section="A",
        end_time=p1_end,
        duration_seconds=300,
        require_face=False,
        require_geo=False
    )
    session_1b.start_time = (now_local - timedelta(minutes=5)).time() # Later in the same period
    session_1b.save(update_fields=['start_time'])

    # Token verify for Session 1B must report already marked for this period
    v_res_1b = client.get(f"/api/attendance/sessions/verify-token/?token={session_1b.qr_token}")
    assert v_res_1b.status_code == 200
    assert v_res_1b.data['is_already_marked'] == True
    print(f"Token verification for new Session 1B correctly flags is_already_marked=True! Message: {v_res_1b.data.get('already_marked_message')} (PASS)")

    # Attempting to mark attendance for Session 1B must return 409 Conflict
    mark_res_1b = client.post("/api/attendance/mark-qr/", {
        "qr_token": session_1b.qr_token,
        "ignore_timetable": True
    }, format="json")
    assert mark_res_1b.status_code == 409
    assert mark_res_1b.data['already_marked'] == True
    assert mark_res_1b.data['period_conflict'] == True
    print(f"Rejected with 409: '{mark_res_1b.data['detail']}' (PASS)")

    # =========================================================================
    # TEST 4: Student marks attendance in Period 2 (Subject 2) -> Must be ALLOWED!
    # =========================================================================
    print("\n--- TEST 4: Student marks attendance for DIFFERENT Period 2 ---")
    session_2 = AttendanceSession.create_session(
        subject=subject2,
        teacher=teacher_user,
        academic_class=academic_class,
        timetable_slot=slot2,
        section="A",
        end_time=p2_end,
        duration_seconds=300,
        require_face=False,
        require_geo=False
    )
    session_2.start_time = p2_start
    session_2.save(update_fields=['start_time'])

    v_res_2 = client.get(f"/api/attendance/sessions/verify-token/?token={session_2.qr_token}")
    assert v_res_2.status_code == 200
    assert v_res_2.data['is_already_marked'] == False
    print("Token verification for Period 2 indicates attendance NOT yet marked. (PASS)")

    mark_res_2 = client.post("/api/attendance/mark-qr/", {
        "qr_token": session_2.qr_token,
        "ignore_timetable": True
    }, format="json")
    assert mark_res_2.status_code in [200, 201]
    assert mark_res_2.data['status'] == 'Present'
    print(f"Attendance for Period 2 marked PRESENT successfully! (PASS)")

    # =========================================================================
    # TEST 5: Verify record counts: Exactly 1 record for Period 1, exactly 1 for Period 2
    # =========================================================================
    print("\n--- TEST 5: Verify Exactly 1 Attendance Record per Period ---")
    recs_period1 = AttendanceRecord.objects.filter(
        student=student_obj,
        date=today_date,
        timetable_slot=slot1
    )
    recs_period2 = AttendanceRecord.objects.filter(
        student=student_obj,
        date=today_date,
        timetable_slot=slot2
    )
    total_today = AttendanceRecord.objects.filter(student=student_obj, date=today_date).count()

    print(f"Records for Period 1: {recs_period1.count()} (Expected: 1)")
    print(f"Records for Period 2: {recs_period2.count()} (Expected: 1)")
    print(f"Total Records for Today: {total_today} (Expected: 2)")

    assert recs_period1.count() == 1
    assert recs_period2.count() == 1
    assert total_today == 2

    # Cleanup test records
    AttendanceRecord.objects.filter(student=student_obj).delete()
    AttendanceSession.objects.filter(id__in=[session_1a.id, session_1b.id, session_2.id]).delete()
    TimetableSlot.objects.filter(id__in=[slot1.id, slot2.id]).delete()

    print("\n======================================================================")
    print(" ALL TESTS PASSED: ATTENDANCE IS STRICTLY MARKED ONCE PER PERIOD! ")
    print("======================================================================")

if __name__ == "__main__":
    run_tests()
