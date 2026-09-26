from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone

from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsAdmin
from students.models import Student, FacultyAssignment
from attendance.models import AttendanceRecord
from audit.models import AuditLog
from notifications.models import Notification
from .models import (
    Subject,
    Assessment,
    Marks,
    StudentScore,
    calculate_grade_and_points,
    ExamSession,
    ExamTimetable,
    HallTicket,
)
from .serializers import (
    SubjectSerializer,
    AssessmentSerializer,
    MarksSerializer,
    StudentScoreSerializer,
    ExamSessionSerializer,
    ExamTimetableSerializer,
    HallTicketSerializer,
)


# =====================================================================
# TEACHER / ADMIN: ALL SCORES OVERVIEW
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def list_student_scores(request):
    """
    List authentic student scores directly from the database.
    Supports filtering by ?branch=CSE&year=3&semester=5&section=A&class_id=1&student_id=1
    """
    branch_param = request.query_params.get('branch', None)
    year_param = request.query_params.get('year', None)
    sem_param = request.query_params.get('semester', None)
    sec_param = request.query_params.get('section', None)
    class_id_param = request.query_params.get('class_id', None)
    student_id_param = request.query_params.get('student_id', None)

    students = Student.objects.filter(is_active=True).select_related('academic_class')
    if branch_param and branch_param.upper() != 'ALL':
        students = students.filter(branch__iexact=branch_param)
    if year_param:
        students = students.filter(year=year_param)
    if sem_param:
        students = students.filter(semester=str(sem_param))
    if sec_param and sec_param.upper() != 'ALL':
        students = students.filter(section__iexact=sec_param)
    if class_id_param:
        students = students.filter(academic_class_id=class_id_param)
    if student_id_param:
        students = students.filter(id=student_id_param)

    results = []
    for s in students:
        scores = StudentScore.objects.filter(student=s).select_related('subject')

        detailed_scores = [
            {
                "subject_id": sc.subject.id,
                "code": sc.subject.code,
                "name": sc.subject.name,
                "credits": sc.subject.credits,
                "internals": sc.internals,
                "end_sem": sc.end_sem,
                "total": sc.total,
                "grade": sc.grade,
                "grade_point": sc.grade_point,
                "grade_class": sc.grade_class,
                "is_passed": sc.grade != 'F' and sc.total >= 40.0
            }
            for sc in scores
        ]

        if scores.exists():
            maths = scores.filter(subject__name__icontains='math').first()
            coding = (
                scores.filter(subject__name__icontains='tech').first() or
                scores.filter(subject__name__icontains='program').first() or
                scores.filter(subject__name__icontains='data').first() or
                scores.first()
            )
            other = scores.exclude(id__in=[maths.id if maths else 0, coding.id if coding else 0]).first()

            maths_val = maths.total if maths else 0.0
            coding_val = coding.total if coding else 0.0
            science_val = other.total if other else 0.0

            total_points = sum(sc.subject.credits * sc.grade_point for sc in scores)
            total_credits = sum(sc.subject.credits for sc in scores)
            sgpa = round(total_points / total_credits, 2) if total_credits > 0 else 0.0

            avg_score = round(sum(sc.total for sc in scores) / scores.count(), 1)
            grade, _, grade_class = calculate_grade_and_points(avg_score)
        else:
            # Student has no scores in database yet
            maths_val = 0.0
            coding_val = 0.0
            science_val = 0.0
            avg_score = 0.0
            sgpa = 0.0
            grade = "N/A"
            grade_class = "grade-na"

        results.append({
            "student_id": s.id,
            "name": s.name,
            "roll_no": s.roll_no or f"STU-2024-{s.id:03d}",
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
            "section": s.section,
            "academic_class_name": str(s.academic_class) if s.academic_class else f"{s.branch} Y{s.year}S{s.semester}-{s.section}",
            "maths": maths_val,
            "science": science_val,
            "coding": coding_val,
            "scores": detailed_scores,
            "avg": avg_score,
            "sgpa": sgpa,
            "grade": grade,
            "gradeClass": grade_class,
            "has_records": scores.exists()
        })

    return Response(results, status=status.HTTP_200_OK)


# =====================================================================
# INDIVIDUAL STUDENT REPORT CARD & GRADEBOOK
# =====================================================================

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSelfOrStaff])
def student_report_card(request, student_id):
    """
    Get authentic official report card, subject marks, attendance, and real SGPA/CGPA.
    NO FAKE SEEDED MARKS.
    """
    try:
        student = Student.objects.get(id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

    # Enforce student isolation: students can only access their own academic records
    profile = getattr(request.user, 'profile', None)
    if profile and profile.role == 'student':
        if not profile.student or profile.student.id != student.id:
            return Response(
                {"detail": "You do not have permission to access another student's records."},
                status=status.HTTP_403_FORBIDDEN
            )

    scores = StudentScore.objects.filter(student=student).select_related('subject')
    subjects_data = []

    for sc in scores:
        sub = sc.subject
        # Calculate real attendance for this specific subject
        sub_recs = AttendanceRecord.objects.filter(student=student, subject=sub)
        sub_total = sub_recs.count()
        sub_present = sub_recs.filter(status='Present').count()
        sub_att_rate = round((sub_present / sub_total * 100), 1) if sub_total > 0 else 0.0

        subjects_data.append({
            "code": sub.code,
            "name": sub.name,
            "credits": sub.credits,
            "internals": sc.internals,
            "endSem": sc.end_sem,
            "total": sc.total,
            "grade": sc.grade,
            "gradePoint": sc.grade_point,
            "gradeClass": sc.grade_class,
            "attendance": sub_att_rate,
            "totalClasses": sub_total,
            "attended": sub_present,
            "isPassed": sc.grade != 'F' and sc.total >= 40.0
        })

    total_credits = sum(s["credits"] for s in subjects_data)
    earned_credits = sum(s["credits"] for s in subjects_data if s["isPassed"])

    # Real SGPA formula: sum(credit * grade_point) / sum(credits)
    if total_credits > 0:
        weighted_points = sum(s["credits"] * s["gradePoint"] for s in subjects_data)
        sgpa = round(weighted_points / total_credits, 2)
        cgpa = sgpa  # Cumulative CGPA across current semester subjects
    else:
        sgpa = 0.0
        cgpa = 0.0

    return Response({
        "student_id": student.id,
        "name": student.name,
        "roll_no": student.roll_no or f"STU-2024-{student.id:03d}",
        "student_id_str": student.student_id or f"STU2024{student.id:04d}",
        "branch": student.branch,
        "year": student.year,
        "semester": student.semester,
        "section": student.section,
        "sgpa": sgpa,
        "cgpa": cgpa,
        "total_credits": total_credits,
        "earned_credits": earned_credits,
        "has_records": len(subjects_data) > 0,
        "subjects": subjects_data
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_report_card(request):
    """
    Direct endpoint for logged-in student to retrieve their authentic report card.
    """
    user = request.user
    profile = getattr(user, 'profile', None)
    if not profile or profile.role != 'student' or not profile.student:
        return Response({"error": "Student profile not found."}, status=status.HTTP_404_NOT_FOUND)

    return student_report_card(request._request, profile.student.id)


# =====================================================================
# TEACHER / ADMIN: MARKS ENTRY & SUBJECT MANAGEMENT
# =====================================================================

@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def save_student_score(request):
    """
    Teacher or Admin enters or updates marks for a student and subject.
    Validates range, teacher evaluation assignment, records audit log,
    and sends in-app notification to the evaluated student.
    Payload: { "student_id": 1, "subject_id": 2, "internals": 25.0, "end_sem": 60.0 }
    """
    student_id = request.data.get('student_id')
    subject_id = request.data.get('subject_id')

    if not student_id or not subject_id:
        return Response(
            {"detail": "student_id and subject_id are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        internals = float(request.data.get('internals', 0.0))
        end_sem = float(request.data.get('end_sem', 0.0))
    except (ValueError, TypeError):
        return Response(
            {"detail": "Internals and End-semester marks must be numeric."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if internals < 0 or internals > 40:
        return Response(
            {"detail": "Internals marks must be between 0 and 40."},
            status=status.HTTP_400_BAD_REQUEST
        )
    if end_sem < 0 or end_sem > 60:
        # Standard academic 40 internals + 60 end sem = 100 total
        return Response(
            {"detail": "End-semester marks must be between 0 and 60."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        student = Student.objects.get(id=student_id)
        subject = Subject.objects.get(id=subject_id)
    except (Student.DoesNotExist, Subject.DoesNotExist):
        return Response({"detail": "Student or Subject not found."}, status=status.HTTP_404_NOT_FOUND)

    # Authorization check: If user is teacher (not admin), verify faculty assignment if configured
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin:
        teacher_assignments = FacultyAssignment.objects.filter(teacher=request.user)
        if teacher_assignments.exists():
            is_assigned = teacher_assignments.filter(subject=subject).exists()
            if not is_assigned:
                return Response(
                    {"detail": f"You are not assigned to evaluate marks for {subject.code}."},
                    status=status.HTTP_403_FORBIDDEN
                )

    with transaction.atomic():
        score, created = StudentScore.objects.update_or_create(
            student=student,
            subject=subject,
            defaults={
                'internals': internals,
                'end_sem': end_sem,
            }
        )

    # 1. Audit Log Entry
    AuditLog.log(
        action="MARKS_UPDATE",
        entity="StudentScore",
        entity_id=score.id,
        description=f"Marks entered for {student.name} ({student.roll_no}) in {subject.code}: Internals={internals}, EndSem={end_sem}, Total={score.total} (Grade: {score.grade})",
        request=request
    )

    # 2. In-App Notification to Student
    if hasattr(student, 'user_profile') and student.user_profile and student.user_profile.user:
        Notification.objects.create(
            user=student.user_profile.user,
            title=f"New Grade Published: {subject.code}",
            message=f"Your score for {subject.name} ({subject.code}) has been updated: {score.total}/100 (Grade: {score.grade}, Grade Point: {score.grade_point}).",
            notification_type='marks'
        )

    return Response({
        "message": f"Score saved successfully for {student.name} in {subject.code}.",
        "score": StudentScoreSerializer(score).data
    }, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([IsTeacherOrAdmin])
def list_create_subjects(request):
    """
    List all curriculum subjects or create a new subject (Admin/Teacher).
    """
    if request.method == 'GET':
        branch = request.query_params.get('branch', None)
        subs = Subject.objects.filter(is_active=True)
        if branch and branch.upper() != 'ALL':
            subs = subs.filter(branch__iexact=branch)
        serializer = SubjectSerializer(subs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        serializer = SubjectSerializer(data=request.data)
        if serializer.is_valid():
            subject = serializer.save()
            AuditLog.log(
                action="ACADEMIC_SETUP",
                entity="Subject",
                entity_id=str(subject.id),
                description=f"Admin created curriculum course '{subject.code}: {subject.name}' ({subject.credits} Credits, {subject.branch}, Sem {subject.semester}, {subject.department}).",
                user=request.user,
                request=request
            )
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        error_msg = "Failed to create curriculum course."
        if serializer.errors:
            first_field = next(iter(serializer.errors))
            first_err = serializer.errors[first_field]
            if isinstance(first_err, list) and first_err:
                error_msg = f"{first_field.capitalize()}: {first_err[0]}"
            else:
                error_msg = f"{first_field.capitalize()}: {first_err}"

        return Response({"detail": error_msg, "errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'DELETE'])
@permission_classes([IsTeacherOrAdmin])
def delete_subject_view(request, subject_id):
    """
    Retrieve or delete a curriculum subject (Admin/Teacher).
    """
    try:
        subject = Subject.objects.get(id=subject_id)
    except Subject.DoesNotExist:
        return Response({"detail": "Curriculum course not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = SubjectSerializer(subject)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'DELETE':
        code = subject.code
        name = subject.name
        subject.delete()
        AuditLog.log(
            action="ACADEMIC_SETUP",
            entity="Subject",
            entity_id=str(subject_id),
            description=f"Admin deleted curriculum course '{code}: {name}'.",
            user=request.user,
            request=request
        )
        return Response({"detail": f"Course '{code} - {name}' deleted successfully."}, status=status.HTTP_200_OK)



@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def performance_summary(request):
    """
    Returns aggregate performance analytics:
    - average score calculated among branches
    - top branch and individual branch averages
    - total students scored
    """
    students = Student.objects.filter(is_active=True)
    branch_data = {}
    total_scored_students = 0

    for s in students:
        b = (s.branch or 'General').strip().upper()
        scores = StudentScore.objects.filter(student=s)
        if scores.exists():
            s_avg = sum(sc.total for sc in scores) / scores.count()
            if b not in branch_data:
                branch_data[b] = []
            branch_data[b].append(s_avg)
            total_scored_students += 1

    branch_performance = []
    top_branch_name = "—"
    top_branch_avg = 0.0

    for b, avgs in sorted(branch_data.items()):
        b_avg = round(sum(avgs) / len(avgs), 1)
        branch_performance.append({
            "branch": b,
            "average_score": b_avg,
            "student_count": len(avgs)
        })
        if b_avg > top_branch_avg:
            top_branch_avg = b_avg
            top_branch_name = b

    avg_among_branches = (
        round(sum(item['average_score'] for item in branch_performance) / len(branch_performance), 1)
        if branch_performance else 0.0
    )

    top_branch_display = f"{top_branch_name} ({top_branch_avg}%)" if top_branch_name != "—" else "—"

    return Response({
        "average_score": avg_among_branches,
        "top_branch": top_branch_name,
        "top_branch_avg": top_branch_avg,
        "top_branch_display": top_branch_display,
        "branch_performance": branch_performance,
        "total_scored_students": total_scored_students
    }, status=status.HTTP_200_OK)


# =====================================================================
# EXAM SESSIONS & HALL TICKET MANAGEMENT VIEWS
# =====================================================================

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def list_create_exam_sessions(request):
    """
    GET: List exam sessions. Students see published exams; teachers/admins see all.
    POST: Create an exam session with optional timetable schedules (Faculty/Admin only).
    """
    if request.method == 'GET':
        profile = getattr(request.user, 'profile', None)
        role = getattr(profile, 'role', 'admin') if profile else ('admin' if request.user.is_staff else 'student')

        qs = ExamSession.objects.all().order_by('-start_date')
        if role == 'student':
            qs = qs.filter(is_published=True)

        branch = request.query_params.get('branch')
        semester = request.query_params.get('semester')
        if branch and branch.upper() != 'ALL':
            qs = qs.filter(branch__in=['ALL', branch.upper(), branch])
        if semester and semester.upper() != 'ALL':
            qs = qs.filter(semester__in=['ALL', str(semester)])

        serializer = ExamSessionSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        profile = getattr(request.user, 'profile', None)
        role = getattr(profile, 'role', 'admin') if profile else ('admin' if request.user.is_staff else 'student')
        if role == 'student':
            return Response({"detail": "Only faculty or administrators can schedule examinations."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        name = data.get('name')
        if not name:
            return Response({"detail": "Examination name is required."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            exam = ExamSession.objects.create(
                name=name,
                college_name=data.get('college_name') or "ST. PETER'S ENGINEERING COLLEGE",
                academic_year=data.get('academic_year', '2025-2026'),
                exam_type=data.get('exam_type', 'REGULAR'),
                branch=data.get('branch', 'ALL'),
                semester=str(data.get('semester', 'ALL')),
                start_date=data.get('start_date'),
                end_date=data.get('end_date'),
                min_attendance_percentage=float(data.get('min_attendance_percentage', 75.0)),
                is_published=bool(data.get('is_published', True)),
                is_approved_by_admin=bool(data.get('is_approved_by_admin', False)),
                is_released_to_students=bool(data.get('is_released_to_students', False)),
                instructions=data.get('instructions') or (
                    "1. Candidates must arrive at the examination hall at least 15 minutes before commencement.\n"
                    "2. Possession of mobile phones, smartwatches, or unauthorized study material is strictly prohibited.\n"
                    "3. Candidates must carry their valid College Identity Card and this printed Hall Ticket.\n"
                    "4. No candidate will be admitted to the examination hall 30 minutes after the exam start time."
                )
            )

            timetable_list = data.get('timetable', [])
            for idx, item in enumerate(timetable_list, start=1):
                sub_id = item.get('subject_id') or item.get('subject')
                if sub_id:
                    ExamTimetable.objects.create(
                        exam_session=exam,
                        subject_id=sub_id,
                        exam_date=item.get('exam_date') or exam.start_date,
                        start_time=item.get('start_time', '10:00:00'),
                        end_time=item.get('end_time', '13:00:00'),
                        hall_number=item.get('hall_number', 'Main Exam Block'),
                        order=item.get('order', idx)
                    )

            AuditLog.log(
                action='CREATE',
                entity='ExamSession',
                entity_id=str(exam.id),
                description=f"Created Exam Session '{exam.name}' ({exam.academic_year}) with {len(timetable_list)} timetable papers.",
                user=request.user,
                request=request
            )

            return Response(ExamSessionSerializer(exam).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def exam_session_detail(request, exam_id):
    """
    GET, update, or delete an exam session.
    """
    try:
        exam = ExamSession.objects.get(id=exam_id)
    except ExamSession.DoesNotExist:
        return Response({"detail": "Exam session not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(ExamSessionSerializer(exam).data, status=status.HTTP_200_OK)

    profile = getattr(request.user, 'profile', None)
    role = getattr(profile, 'role', 'admin') if profile else ('admin' if request.user.is_staff else 'student')
    if role == 'student':
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    if request.method in ['PUT', 'PATCH']:
        data = request.data
        if 'name' in data:
            exam.name = data['name']
        if 'college_name' in data:
            exam.college_name = data['college_name']
        if 'academic_year' in data:
            exam.academic_year = data['academic_year']
        if 'exam_type' in data:
            exam.exam_type = data['exam_type']
        if 'branch' in data:
            exam.branch = data['branch']
        if 'semester' in data:
            exam.semester = str(data['semester'])
        if 'start_date' in data and data['start_date']:
            exam.start_date = data['start_date']
        if 'end_date' in data and data['end_date']:
            exam.end_date = data['end_date']
        if 'min_attendance_percentage' in data:
            exam.min_attendance_percentage = float(data['min_attendance_percentage'])
        if 'is_published' in data:
            exam.is_published = bool(data['is_published'])
        if 'is_approved_by_admin' in data:
            exam.is_approved_by_admin = bool(data['is_approved_by_admin'])
            if exam.is_approved_by_admin and not exam.approved_by:
                exam.approved_by = request.user
                exam.approved_at = timezone.now()
        if 'is_released_to_students' in data:
            exam.is_released_to_students = bool(data['is_released_to_students'])
            if exam.is_released_to_students and not exam.released_at:
                exam.released_at = timezone.now()
        if 'instructions' in data:
            exam.instructions = data['instructions']
        exam.save()

        if 'timetable' in data:
            with transaction.atomic():
                exam.timetable.all().delete()
                for idx, item in enumerate(data['timetable'], start=1):
                    sub_id = item.get('subject_id') or item.get('subject')
                    if sub_id:
                        ExamTimetable.objects.create(
                            exam_session=exam,
                            subject_id=sub_id,
                            exam_date=item.get('exam_date') or exam.start_date,
                            start_time=item.get('start_time', '10:00:00'),
                            end_time=item.get('end_time', '13:00:00'),
                            hall_number=item.get('hall_number', 'Main Exam Block'),
                            order=item.get('order', idx)
                        )

        return Response(ExamSessionSerializer(exam).data, status=status.HTTP_200_OK)

    elif request.method == 'DELETE':
        name = exam.name
        exam.delete()
        AuditLog.log(
            action='DELETE',
            entity='ExamSession',
            entity_id=str(exam_id),
            description=f"Deleted Exam Session '{name}'.",
            user=request.user,
            request=request
        )
        return Response({"detail": f"Exam session '{name}' deleted successfully."}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def generate_hall_tickets(request, exam_id):
    """
    Automated Hall Ticket Generation & Attendance Eligibility Engine:
    - Queries all students belonging to the target branch/semester.
    - Calculates live attendance percentage using AttendanceRecord (counting Present, On-Duty, Medical, Excused).
    - If attendance >= min_attendance_percentage or condoned, marks is_eligible=True.
    - Generates or updates HallTicket records with secure verification tokens and hall ticket numbers.
    - Dispatches notifications to students.
    """
    try:
        exam = ExamSession.objects.get(id=exam_id)
    except ExamSession.DoesNotExist:
        return Response({"detail": "Exam session not found."}, status=status.HTTP_404_NOT_FOUND)

    students_qs = Student.objects.filter(is_active=True)
    if exam.branch and exam.branch.upper() != 'ALL':
        students_qs = students_qs.filter(branch__iexact=exam.branch)
    if exam.semester and str(exam.semester).upper() != 'ALL':
        students_qs = students_qs.filter(semester=str(exam.semester))

    eligible_count = 0
    shortage_count = 0
    generated_count = 0

    with transaction.atomic():
        for student in students_qs:
            recs = AttendanceRecord.objects.filter(student=student)
            total = recs.count()
            attended = recs.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
            att_pct = round((attended / total * 100.0), 1) if total > 0 else 85.0

            existing_ticket = HallTicket.objects.filter(exam_session=exam, student=student).first()
            is_condoned = existing_ticket.is_condoned if existing_ticket else False

            is_eligible = (att_pct >= exam.min_attendance_percentage) or is_condoned

            ticket, created = HallTicket.objects.update_or_create(
                exam_session=exam,
                student=student,
                defaults={
                    'calculated_attendance_pct': att_pct,
                    'is_eligible': is_eligible,
                    'is_condoned': is_condoned,
                }
            )

            generated_count += 1
            if is_eligible:
                eligible_count += 1
            else:
                shortage_count += 1

            user_profile = getattr(student, 'user_profile', None)
            profile_user = getattr(user_profile, 'user', None) if user_profile else None
            if profile_user:
                if is_eligible:
                    Notification.objects.create(
                        user=profile_user,
                        title="Exam Hall Ticket Generated 🎓",
                        message=f"Your Hall Ticket for '{exam.name}' is now available. Attendance: {att_pct}%. You are eligible to download and print.",
                        notification_type='academic'
                    )
                else:
                    Notification.objects.create(
                        user=profile_user,
                        title="Exam Eligibility Shortage Alert ⚠️",
                        message=f"Attendance Shortage for '{exam.name}': Your attendance is {att_pct}% (minimum required: {exam.min_attendance_percentage}%). Contact department or apply for OD/Medical leave.",
                        notification_type='attendance'
                    )

    AuditLog.log(
        action='GENERATE_HALL_TICKETS',
        entity='ExamSession',
        entity_id=str(exam.id),
        description=f"Generated {generated_count} hall tickets for '{exam.name}'. Eligible: {eligible_count}, Shortage: {shortage_count}.",
        user=request.user,
        request=request
    )

    return Response({
        "detail": f"Processed {generated_count} students. {eligible_count} eligible, {shortage_count} with attendance shortage.",
        "total_generated": generated_count,
        "eligible_count": eligible_count,
        "shortage_count": shortage_count,
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def approve_and_release_hall_tickets(request, exam_id):
    """
    Admin or Authorized Authority explicitly approves and releases hall tickets to students.
    Payload: { "action": "release" | "revoke" }
    - 'release':
        Marks is_approved_by_admin = True, is_released_to_students = True,
        records approved_by and approved_at timestamp.
        Automatically generates / updates hall tickets for all target students in this session.
        Sends notification to all students.
    - 'revoke':
        Marks is_released_to_students = False, withholding tickets from student views.
    """
    try:
        exam = ExamSession.objects.get(id=exam_id)
    except ExamSession.DoesNotExist:
        return Response({"detail": "Exam session not found."}, status=status.HTTP_404_NOT_FOUND)

    action = request.data.get('action', 'release').lower()

    if action == 'release':
        exam.is_approved_by_admin = True
        exam.approved_by = request.user
        exam.approved_at = timezone.now()
        exam.is_released_to_students = True
        exam.released_at = timezone.now()
        exam.save()

        # Batch generate / sync tickets for all cohort students
        students_qs = Student.objects.filter(is_active=True)
        if exam.branch and exam.branch.upper() != 'ALL':
            students_qs = students_qs.filter(branch__iexact=exam.branch)
        if exam.semester and str(exam.semester).upper() != 'ALL':
            students_qs = students_qs.filter(semester=str(exam.semester))

        count_generated = 0
        with transaction.atomic():
            for student in students_qs:
                recs = AttendanceRecord.objects.filter(student=student)
                total = recs.count()
                attended = recs.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
                att_pct = round((attended / total * 100.0), 1) if total > 0 else 85.0

                existing_ticket = HallTicket.objects.filter(exam_session=exam, student=student).first()
                is_condoned = existing_ticket.is_condoned if existing_ticket else False
                is_eligible = (att_pct >= exam.min_attendance_percentage) or is_condoned

                HallTicket.objects.update_or_create(
                    exam_session=exam,
                    student=student,
                    defaults={
                        'calculated_attendance_pct': att_pct,
                        'is_eligible': is_eligible,
                        'is_condoned': is_condoned,
                    }
                )
                count_generated += 1

                user_profile = getattr(student, 'user_profile', None)
                profile_user = getattr(user_profile, 'user', None) if user_profile else None
                if profile_user:
                    Notification.objects.create(
                        user=profile_user,
                        title=f"Hall Tickets Released: {exam.name} 🎓",
                        message=f"Admin has approved and officially released the Examination Hall Tickets for '{exam.name}' ({exam.college_name}). You can now view and download your Admit Card from your portal.",
                        notification_type='academic'
                    )

        AuditLog.log(
            action='APPROVE_RELEASE_HALL_TICKETS',
            entity='ExamSession',
            entity_id=str(exam.id),
            description=f"Admin {request.user.username} approved and released hall tickets for '{exam.name}' ({exam.college_name}) to {count_generated} students.",
            user=request.user,
            request=request
        )

        return Response({
            "detail": f"Hall tickets successfully approved and released to {count_generated} students.",
            "exam": ExamSessionSerializer(exam).data
        }, status=status.HTTP_200_OK)

    else:
        exam.is_released_to_students = False
        exam.save()

        AuditLog.log(
            action='REVOKE_RELEASE_HALL_TICKETS',
            entity='ExamSession',
            entity_id=str(exam.id),
            description=f"Admin {request.user.username} withheld / revoked student release of hall tickets for '{exam.name}'.",
            user=request.user,
            request=request
        )

        return Response({
            "detail": f"Hall tickets withheld from students for '{exam.name}'.",
            "exam": ExamSessionSerializer(exam).data
        }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def list_exam_hall_tickets(request, exam_id):
    """
    List all hall tickets generated for an exam session.
    Supports filtering by ?status=ELIGIBLE|SHORTAGE|CONDONED and ?search=
    """
    try:
        exam = ExamSession.objects.get(id=exam_id)
    except ExamSession.DoesNotExist:
        return Response({"detail": "Exam session not found."}, status=status.HTTP_404_NOT_FOUND)

    tickets = HallTicket.objects.filter(exam_session=exam).select_related('student', 'condoned_by', 'exam_session')

    status_filter = request.query_params.get('status', 'ALL').upper()
    if status_filter == 'ELIGIBLE':
        tickets = tickets.filter(is_eligible=True)
    elif status_filter == 'SHORTAGE':
        tickets = tickets.filter(is_eligible=False)
    elif status_filter == 'CONDONED':
        tickets = tickets.filter(is_condoned=True)

    search_query = request.query_params.get('search', '').strip()
    if search_query:
        tickets = tickets.filter(
            models.Q(student__name__icontains=search_query) |
            models.Q(student__roll_no__icontains=search_query) |
            models.Q(hall_ticket_number__icontains=search_query)
        )

    serializer = HallTicketSerializer(tickets, many=True)
    return Response({
        "exam": ExamSessionSerializer(exam).data,
        "total_tickets": tickets.count(),
        "tickets": serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsTeacherOrAdmin])
def condone_hall_ticket(request, ticket_id):
    """
    Grant or revoke condonation override for a student detained due to attendance shortage.
    """
    try:
        ticket = HallTicket.objects.select_related('student', 'exam_session').get(id=ticket_id)
    except HallTicket.DoesNotExist:
        return Response({"detail": "Hall ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    is_condoned = bool(request.data.get('is_condoned', True))
    reason = (request.data.get('reason') or '').strip()

    ticket.is_condoned = is_condoned
    if is_condoned:
        ticket.is_eligible = True
        ticket.condoned_by = request.user
        ticket.condoned_at = timezone.now()
        ticket.condonation_reason = reason or "Condonation granted by department authority."
    else:
        ticket.condoned_by = None
        ticket.condoned_at = None
        ticket.condonation_reason = ""
        ticket.is_eligible = (ticket.calculated_attendance_pct >= ticket.exam_session.min_attendance_percentage)

    ticket.save()

    user_profile = getattr(ticket.student, 'user_profile', None)
    profile_user = getattr(user_profile, 'user', None) if user_profile else None
    if profile_user:
        if is_condoned:
            Notification.objects.create(
                user=profile_user,
                title="Condonation Approved • Hall Ticket Issued ✅",
                message=f"Attendance condonation granted for '{ticket.exam_session.name}'. Remarks: {ticket.condonation_reason}. Your hall ticket is now available.",
                notification_type='academic'
            )
        else:
            Notification.objects.create(
                user=profile_user,
                title="Condonation Revoked ⚠️",
                message=f"Condonation for '{ticket.exam_session.name}' has been revoked. Current attendance: {ticket.calculated_attendance_pct}%.",
                notification_type='academic'
            )

    AuditLog.log(
        action='CONDONE_HALL_TICKET',
        entity='HallTicket',
        entity_id=str(ticket.id),
        description=f"{'Granted' if is_condoned else 'Revoked'} condonation for {ticket.student.name} ({ticket.student.roll_no}) in '{ticket.exam_session.name}'. Remarks: {reason}",
        user=request.user,
        request=request
    )

    return Response(HallTicketSerializer(ticket).data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_hall_tickets(request):
    """
    Returns active hall tickets for the logged-in student.
    If hall tickets haven't been generated for a published exam matching their branch/semester,
    computes and creates the student's ticket on demand.
    """
    profile = getattr(request.user, 'profile', None)
    student = getattr(profile, 'student', None) if profile else None

    if not student:
        student = Student.objects.filter(email=request.user.email).first()

    if not student:
        return Response({"detail": "Student profile not found for this user account."}, status=status.HTTP_404_NOT_FOUND)

    published_exams = ExamSession.objects.filter(is_published=True).order_by('-start_date')
    student_branch = (student.branch or '').strip().upper()
    student_sem = str(student.semester or '').strip()

    pending_sessions = []
    for exam in published_exams:
        if exam.branch and exam.branch.upper() not in ['ALL', student_branch]:
            continue
        if exam.semester and str(exam.semester) not in ['ALL', student_sem]:
            continue

        if not exam.is_released_to_students:
            timetable_papers = []
            for tt in exam.timetable.all():
                s = tt.subject
                if student_branch and s.branch and s.branch.upper() not in ['ALL', student_branch]:
                    continue
                timetable_papers.append({
                    "subject_code": s.code,
                    "subject_name": s.name,
                    "exam_date": str(tt.exam_date),
                    "start_time": tt.start_time.strftime("%I:%M %p") if hasattr(tt.start_time, 'strftime') else str(tt.start_time),
                    "end_time": tt.end_time.strftime("%I:%M %p") if hasattr(tt.end_time, 'strftime') else str(tt.end_time),
                    "hall_number": tt.hall_number
                })

            pending_sessions.append({
                "id": exam.id,
                "name": exam.name,
                "college_name": exam.college_name,
                "academic_year": exam.academic_year,
                "exam_type": exam.get_exam_type_display(),
                "start_date": exam.start_date,
                "end_date": exam.end_date,
                "min_attendance_percentage": exam.min_attendance_percentage,
                "timetable": timetable_papers,
                "is_approved_by_admin": exam.is_approved_by_admin,
                "is_released_to_students": False,
                "message": "Examination dates and subjects have been scheduled by the administration. Hall tickets will appear once officially approved and released by the Admin."
            })
            continue

        # Exam IS released to students - ensure ticket is created/synced
        if not HallTicket.objects.filter(exam_session=exam, student=student).exists():
            recs = AttendanceRecord.objects.filter(student=student)
            total = recs.count()
            attended = recs.filter(status__in=['Present', 'On-Duty', 'Medical', 'Excused']).count()
            att_pct = round((attended / total * 100.0), 1) if total > 0 else 85.0
            is_eligible = (att_pct >= exam.min_attendance_percentage)

            HallTicket.objects.create(
                exam_session=exam,
                student=student,
                calculated_attendance_pct=att_pct,
                is_eligible=is_eligible,
                is_condoned=False
            )

    released_tickets = HallTicket.objects.filter(
        student=student,
        exam_session__is_published=True,
        exam_session__is_released_to_students=True
    ).select_related('exam_session', 'condoned_by').order_by('-exam_session__start_date')

    serializer = HallTicketSerializer(released_tickets, many=True)
    return Response({
        "tickets": serializer.data,
        "pending_sessions": pending_sessions
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def verify_hall_ticket(request, token):
    """
    Public QR-code verification endpoint for examination invigilators and proctors.
    """
    try:
        ticket = HallTicket.objects.select_related('student', 'exam_session', 'condoned_by').get(verification_token=token)
    except (HallTicket.DoesNotExist, ValueError):
        return Response({
            "valid": False,
            "error": "Invalid or expired hall ticket QR code token.",
            "status": "INVALID_TOKEN"
        }, status=status.HTTP_404_NOT_FOUND)

    student = ticket.student
    exam = ticket.exam_session

    if not exam.is_released_to_students:
        return Response({
            "valid": False,
            "error": "This examination hall ticket has not yet been approved and officially released by the Admin / Examination Controller.",
            "status": "UNRELEASED_EXAM",
            "college_name": exam.college_name,
            "exam_name": exam.name,
        }, status=status.HTTP_400_BAD_REQUEST)

    papers = ticket.exam_session.timetable.all()
    student_branch = (student.branch or '').strip().upper()
    student_sem = str(student.semester or '').strip()
    relevant_papers = []
    for p in papers:
        s = p.subject
        if student_branch and s.branch and s.branch.upper() not in ['ALL', student_branch]:
            continue
        if student_sem and s.semester and s.semester not in ['ALL', student_sem]:
            continue
        relevant_papers.append(p)
    if not relevant_papers:
        relevant_papers = list(papers)

    return Response({
        "valid": True,
        "status": "VERIFIED_AUTHENTIC" if ticket.is_eligible else "INELIGIBLE_DETAINED",
        "status_display": "Authentic & Verified for Examination" if ticket.is_eligible else "Attendance Shortage (Not Permitted)",
        "hall_ticket_number": ticket.hall_ticket_number,
        "student": {
            "name": student.name,
            "roll_no": student.roll_no,
            "student_id": student.student_id,
            "branch": student.branch,
            "semester": student.semester,
            "section": student.section,
            "department": student.department,
            "profile_pic": student.profile_photo or (getattr(getattr(student, 'user_profile', None), 'profile_pic', '')),
        },
        "exam": {
            "name": exam.name,
            "college_name": exam.college_name,
            "academic_year": exam.academic_year,
            "exam_type": exam.get_exam_type_display(),
            "start_date": exam.start_date,
            "end_date": exam.end_date,
            "is_approved_by_admin": exam.is_approved_by_admin,
            "is_released_to_students": exam.is_released_to_students,
        },
        "attendance": {
            "percentage": ticket.calculated_attendance_pct,
            "required_percentage": exam.min_attendance_percentage,
            "is_eligible": ticket.is_eligible,
            "is_condoned": ticket.is_condoned,
            "condonation_reason": ticket.condonation_reason if ticket.is_condoned else None,
        },
        "timetable": ExamTimetableSerializer(relevant_papers, many=True).data,
        "verified_at": timezone.now().isoformat(),
    }, status=status.HTTP_200_OK)

