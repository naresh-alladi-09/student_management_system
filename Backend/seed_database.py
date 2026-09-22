import os
import django
from datetime import date, time, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_config.settings')
django.setup()

from django.contrib.auth.models import User
from accounts.models import UserProfile
from students.models import Student
from attendance.models import AttendanceRecord
from performance.models import Subject, StudentScore, Assessment, Marks
from timetable.models import TimetableSlot
from announcements.models import Announcement
from notifications.models import Notification
from audit.models import AuditLog


def seed_data():
    print("=" * 60)
    print("SEEDING ACADEMIC DATABASE (INTERVIEW-READY)")
    print("=" * 60)

    # 1. Teachers / Admins
    teacher_user, created = User.objects.get_or_create(
        username="madam",
        defaults={"email": "faculty@eduportal.com", "first_name": "Faculty", "last_name": "Advisor"}
    )
    teacher_user.set_password("123456")
    teacher_user.save()
    UserProfile.objects.update_or_create(
        user=teacher_user,
        defaults={"role": "teacher", "department": "Computer Science & Engineering", "phone": "9876543210"}
    )
    print(f"[OK] Faculty account 'madam' initialized with password '123456'.")

    admin_user, created = User.objects.get_or_create(
        username="admin",
        defaults={"email": "admin@eduportal.com", "first_name": "System", "last_name": "Administrator", "is_staff": True, "is_superuser": True}
    )
    admin_user.set_password("admin")
    admin_user.is_staff = True
    admin_user.is_superuser = True
    admin_user.save()
    UserProfile.objects.update_or_create(
        user=admin_user,
        defaults={"role": "admin", "department": "University Administration", "phone": "9998887770"}
    )
    print(f"[OK] Admin account 'admin' initialized with password 'admin'.")

    # 2. Assign Roll Numbers & Create Student Accounts
    students = Student.objects.all().order_by('id')
    for s in students:
        s.is_active = True
        if not s.roll_no:
            s.roll_no = f"STU-2024-{s.id:03d}"
        if not s.student_id:
            s.student_id = f"STU2024{s.id:04d}"
        s.save()

        # Create user login for this student
        student_username = s.roll_no.lower().replace("-", "_")
        stu_user, _ = User.objects.get_or_create(
            username=student_username,
            defaults={"email": s.email, "first_name": s.name}
        )
        stu_user.set_password("student123")
        stu_user.is_active = True
        stu_user.save()
        UserProfile.objects.update_or_create(
            user=stu_user,
            defaults={"role": "student", "student": s, "phone": s.phone, "department": s.branch}
        )
    print(f"[OK] {students.count()} student records updated with roll numbers and login accounts.")

    # 3. Curriculum Subjects
    default_subjects = [
        {"code": "CS501", "name": "Data Structures & Algorithms", "department": "Computer Science & Engineering", "branch": "CSE", "semester": "5", "credits": 4},
        {"code": "CS502", "name": "Database Management Systems", "department": "Computer Science & Engineering", "branch": "CSE", "semester": "5", "credits": 4},
        {"code": "CS503", "name": "Operating Systems", "department": "Computer Science & Engineering", "branch": "CSE", "semester": "5", "credits": 3},
        {"code": "CS504", "name": "Web Technologies & Full Stack", "department": "Computer Science & Engineering", "branch": "CSE", "semester": "5", "credits": 3},
        {"code": "CS505", "name": "Computer Networks", "department": "Computer Science & Engineering", "branch": "CSE", "semester": "5", "credits": 3},
        {"code": "AI501", "name": "Artificial Intelligence & ML", "department": "Artificial Intelligence", "branch": "AIML", "semester": "5", "credits": 4},
        {"code": "AI502", "name": "Deep Learning & Neural Nets", "department": "Artificial Intelligence", "branch": "AIML", "semester": "5", "credits": 4},
        {"code": "IT501", "name": "Cloud Computing & DevOps", "department": "Information Technology", "branch": "IT", "semester": "5", "credits": 3},
    ]

    subject_instances = []
    for sub_data in default_subjects:
        sub, _ = Subject.objects.update_or_create(
            code=sub_data["code"],
            defaults=sub_data
        )
        subject_instances.append(sub)
    print(f"[OK] {len(default_subjects)} curriculum subjects created/verified.")

    # 4. Timetable Slots
    TimetableSlot.objects.all().delete()
    timetable_data = [
        {"subject": subject_instances[0], "teacher": teacher_user, "day": "Monday", "start_time": time(9, 30), "end_time": time(10, 45), "room": "Hall 102", "branch": "CSE", "semester": "5", "section": "A"},
        {"subject": subject_instances[1], "teacher": teacher_user, "day": "Monday", "start_time": time(11, 15), "end_time": time(12, 30), "room": "Lab 3", "branch": "CSE", "semester": "5", "section": "A"},
        {"subject": subject_instances[2], "teacher": teacher_user, "day": "Tuesday", "start_time": time(9, 30), "end_time": time(10, 45), "room": "Hall 104", "branch": "CSE", "semester": "5", "section": "A"},
        {"subject": subject_instances[3], "teacher": teacher_user, "day": "Tuesday", "start_time": time(14, 0), "end_time": time(15, 30), "room": "Computing Lab", "branch": "CSE", "semester": "5", "section": "A"},
        {"subject": subject_instances[4], "teacher": teacher_user, "day": "Wednesday", "start_time": time(10, 0), "end_time": time(11, 15), "room": "Hall 102", "branch": "CSE", "semester": "5", "section": "A"},
        {"subject": subject_instances[0], "teacher": teacher_user, "day": "Thursday", "start_time": time(9, 30), "end_time": time(10, 45), "room": "Hall 102", "branch": "CSE", "semester": "5", "section": "A"},
        {"subject": subject_instances[1], "teacher": teacher_user, "day": "Friday", "start_time": time(11, 15), "end_time": time(12, 30), "room": "Lab 3", "branch": "CSE", "semester": "5", "section": "A"},
    ]
    for tt in timetable_data:
        TimetableSlot.objects.create(**tt)
    print(f"[OK] {len(timetable_data)} timetable lecture slots created.")

    # 5. Department Announcements
    Announcement.objects.all().delete()
    announcements_data = [
        {"title": "Mid-Term Examination Schedule Announced", "description": "The Mid-Term examinations for Semester 5 will commence from next Monday. Please review the detailed timetable in your portal.", "created_by": teacher_user, "department": "CSE", "priority": "Important"},
        {"title": "Annual Academic Project Exhibition 2026", "description": "All final year and third year students must submit project phase 1 abstracts by end of this week.", "created_by": admin_user, "department": "All", "priority": "Normal"},
        {"title": "Library Book Return Notice", "description": "All semester reference textbooks borrowed before the mid-term exams must be renewed or returned.", "created_by": admin_user, "department": "All", "priority": "Normal"},
    ]
    for ann in announcements_data:
        Announcement.objects.create(**ann)
    print(f"[OK] {len(announcements_data)} department announcements published.")

    # 6. Notifications
    Notification.objects.all().delete()
    for s in students:
        if hasattr(s, 'user_profile') and s.user_profile.user:
            u = s.user_profile.user
            Notification.objects.create(
                user=u,
                title="Mid-Term Schedule Published",
                message="Mid-term exam schedules for your branch are now visible in the timetable section.",
                notification_type="announcement",
                is_read=False
            )
            Notification.objects.create(
                user=u,
                title="Welcome to Academic Portal",
                message=f"Welcome {s.name}! Your official roll number is {s.roll_no}.",
                notification_type="general",
                is_read=True
            )
    print("[OK] Notifications populated for students.")

    # 7. Authentic Academic Scores
    for s in students:
        stu_subs = Subject.objects.filter(branch__iexact=s.branch)
        if not stu_subs.exists():
            stu_subs = Subject.objects.all()[:4]

        # Explicit marks (e.g. 26-28 internal, 54-62 endsem)
        sample_scores = [
            (27.0, 58.0),
            (25.0, 61.0),
            (28.0, 55.0),
            (24.0, 60.0),
        ]
        for idx, sub in enumerate(stu_subs):
            int_m, end_m = sample_scores[idx % len(sample_scores)]
            StudentScore.objects.update_or_create(
                student=s,
                subject=sub,
                defaults={
                    "internals": int_m,
                    "end_sem": end_m,
                }
            )

    # 8. Audit Log
    AuditLog.log(
        action="LOGIN",
        entity="System",
        entity_id="init",
        description="System initialized with production seed dataset.",
        user=admin_user
    )
    print("[OK] Audit log entry recorded.")
    print("=" * 60)
    print("SEEDING COMPLETED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    seed_data()
