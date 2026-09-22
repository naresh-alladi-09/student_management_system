import os
import django
from datetime import date, timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend_config.settings')
django.setup()

from django.contrib.auth.models import User
from accounts.models import UserProfile
from students.models import Student
from attendance.models import AttendanceRecord
from performance.models import Subject, StudentScore


def seed_data():
    print("=" * 60)
    print("SEEDING INITIAL DATABASE DATA")
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
        defaults={"role": "teacher", "department": "Academic Operations", "phone": "9876543210"}
    )
    print(f"[OK] Faculty account 'madam' initialized with password '123456'.")

    admin_user, created = User.objects.get_or_create(
        username="admin",
        defaults={"email": "admin@eduportal.com", "first_name": "System", "last_name": "Admin", "is_staff": True, "is_superuser": True}
    )
    admin_user.set_password("admin")
    admin_user.save()
    UserProfile.objects.update_or_create(
        user=admin_user,
        defaults={"role": "admin", "department": "Administration", "phone": "9998887770"}
    )
    print(f"[OK] Admin account 'admin' initialized with password 'admin'.")

    # 2. Assign Roll Numbers & Create Student Accounts
    students = Student.objects.all().order_by('id')
    for s in students:
        if not s.roll_no:
            s.roll_no = f"STU-2024-{s.id:03d}"
            s.save()

        # Create user login for this student
        student_username = s.roll_no.lower().replace("-", "_")
        stu_user, _ = User.objects.get_or_create(
            username=student_username,
            defaults={"email": s.email, "first_name": s.name}
        )
        stu_user.set_password("student123")
        stu_user.save()
        UserProfile.objects.update_or_create(
            user=stu_user,
            defaults={"role": "student", "student": s, "phone": s.phone, "department": s.branch}
        )
    print(f"[OK] {students.count()} student records updated with roll numbers and login accounts.")

    # 3. Curriculum Subjects
    default_subjects = [
        {"code": "CS501", "name": "Data Structures & Algorithms", "branch": "CSE", "semester": "5", "credits": 4},
        {"code": "CS502", "name": "Database Management Systems", "branch": "CSE", "semester": "5", "credits": 4},
        {"code": "CS503", "name": "Operating Systems", "branch": "CSE", "semester": "5", "credits": 3},
        {"code": "CS504", "name": "Web Technologies & Full Stack", "branch": "CSE", "semester": "5", "credits": 3},
        {"code": "CS505", "name": "Computer Networks", "branch": "CSE", "semester": "5", "credits": 3},
        {"code": "AI501", "name": "Artificial Intelligence & ML", "branch": "AIML", "semester": "5", "credits": 4},
        {"code": "AI502", "name": "Deep Learning & Neural Nets", "branch": "AIML", "semester": "5", "credits": 4},
        {"code": "IT501", "name": "Cloud Computing & DevOps", "branch": "IT", "semester": "5", "credits": 3},
    ]

    for sub_data in default_subjects:
        Subject.objects.update_or_create(
            code=sub_data["code"],
            defaults=sub_data
        )
    print(f"[OK] {len(default_subjects)} curriculum subjects created/verified.")

    # 4. Initial Attendance Records (Today and Past 7 days)
    today = date.today()
    for day_offset in range(5):
        att_date = today - timedelta(days=day_offset)
        # Skip weekends
        if att_date.weekday() >= 5:
            continue
        for s in students:
            # Most are Present, occasional absent
            status = "Present" if (s.id + day_offset) % 7 != 0 else "Absent"
            AttendanceRecord.objects.update_or_create(
                student=s,
                date=att_date,
                defaults={"status": status}
            )
    print(f"[OK] Attendance records populated for recent dates.")

    # 5. Academic Scores for all Students
    subjects = Subject.objects.all()
    for s in students:
        # Match subjects by branch or fallback to first 5
        stu_subs = subjects.filter(branch__iexact=s.branch)
        if not stu_subs.exists():
            stu_subs = subjects[:5]

        for idx, sub in enumerate(stu_subs):
            seed = (s.id * 7 + idx * 13) % 25
            internals = round(23.0 + (seed % 7), 1)
            end_sem = round(52.0 + (seed % 18), 1)
            StudentScore.objects.update_or_create(
                student=s,
                subject=sub,
                defaults={
                    "internals": internals,
                    "end_sem": end_sem,
                }
            )
    print(f"[OK] Academic scores initialized for all students.")
    print("=" * 60)
    print("SEEDING COMPLETED SUCCESSFULLY!")
    print("=" * 60)


if __name__ == "__main__":
    seed_data()
