from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction

from accounts.permissions import IsTeacherOrAdmin, IsSelfOrStaff, IsAdmin
from students.models import Student
from attendance.models import AttendanceRecord
from .models import Subject, Assessment, Marks, StudentScore, calculate_grade_and_points
from .serializers import SubjectSerializer, AssessmentSerializer, MarksSerializer, StudentScoreSerializer


# =====================================================================
# TEACHER / ADMIN: ALL SCORES OVERVIEW
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def list_student_scores(request):
    """
    List authentic student scores directly from the database.
    NO FAKE PSEUDO-RANDOM SEEDED VALUES.
    Supports ?branch=CSE or ?student_id=1
    """
    branch_param = request.query_params.get('branch', None)
    student_id_param = request.query_params.get('student_id', None)

    students = Student.objects.filter(is_active=True)
    if branch_param and branch_param.upper() != 'ALL':
        students = students.filter(branch__iexact=branch_param)
    if student_id_param:
        students = students.filter(id=student_id_param)

    results = []
    for s in students:
        scores = StudentScore.objects.filter(student=s).select_related('subject')

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
            "maths": maths_val,
            "science": science_val,
            "coding": coding_val,
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
    Payload: { "student_id": 1, "subject_id": 2, "internals": 25.0, "end_sem": 60.0 }
    """
    student_id = request.data.get('student_id')
    subject_id = request.data.get('subject_id')
    internals = float(request.data.get('internals', 0.0))
    end_sem = float(request.data.get('end_sem', 0.0))

    if not student_id or not subject_id:
        return Response(
            {"detail": "student_id and subject_id are required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if internals < 0 or internals > 40:
        return Response(
            {"detail": "Internals marks must be between 0 and 40."},
            status=status.HTTP_400_BAD_REQUEST
        )
    if end_sem < 0 or end_sem > 70:
        return Response(
            {"detail": "End-semester marks must be between 0 and 70."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        student = Student.objects.get(id=student_id)
        subject = Subject.objects.get(id=subject_id)
    except (Student.DoesNotExist, Subject.DoesNotExist):
        return Response({"detail": "Student or Subject not found."}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        score, created = StudentScore.objects.update_or_create(
            student=student,
            subject=subject,
            defaults={
                'internals': internals,
                'end_sem': end_sem,
            }
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
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
