import csv
from datetime import datetime, date
from django.http import HttpResponse
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from accounts.permissions import IsTeacherOrAdmin
from audit.models import AuditLog
from students.models import Student, FacultyAssignment
from attendance.models import AttendanceRecord
from performance.models import Subject, StudentScore, calculate_grade_and_points


# =====================================================================
# 1. ATTENDANCE REPORT & CSV EXPORT
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def attendance_report(request):
    """
    Generate attendance report filtered by date range, branch, year, semester, section, subject, student.
    Returns JSON preview or downloadable CSV (?format=csv).
    """
    branch = request.query_params.get('branch')
    year = request.query_params.get('year')
    semester = request.query_params.get('semester')
    section = request.query_params.get('section')
    subject_id = request.query_params.get('subject_id')
    student_id = request.query_params.get('student_id')
    date_from = request.query_params.get('date_from')
    date_to = request.query_params.get('date_to')
    export_format = request.query_params.get('export', 'json').lower()

    records = AttendanceRecord.objects.select_related('student', 'subject').order_by('-date', '-created_at')

    # Apply filters
    if branch and branch.upper() != 'ALL':
        records = records.filter(student__branch__iexact=branch)
    if year and year != 'ALL':
        records = records.filter(student__year=year)
    if semester and semester != 'ALL':
        records = records.filter(student__semester=str(semester))
    if section and section.upper() != 'ALL':
        records = records.filter(student__section__iexact=section)
    if subject_id and subject_id != 'ALL':
        records = records.filter(subject_id=subject_id)
    if student_id:
        records = records.filter(student_id=student_id)
    if date_from:
        records = records.filter(date__gte=date_from)
    if date_to:
        records = records.filter(date__lte=date_to)

    # Faculty assignment isolation check for teachers
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin:
        assignments = FacultyAssignment.objects.filter(teacher=request.user)
        if assignments.exists():
            assigned_sub_ids = assignments.values_list('subject_id', flat=True)
            records = records.filter(subject_id__in=assigned_sub_ids)

    # Audit logging
    AuditLog.log(
        action="REPORT_GENERATE",
        entity="AttendanceReport",
        entity_id=0,
        description=f"Generated attendance report (Branch: {branch}, Year: {year}, Format: {export_format})",
        request=request
    )

    if export_format == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="attendance_report_{date.today().isoformat()}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Record ID', 'Date', 'Time', 'Roll Number', 'Student Name',
            'Branch', 'Year', 'Semester', 'Section', 'Subject Code',
            'Subject Title', 'Status', 'Marked Via'
        ])

        for r in records:
            writer.writerow([
                r.id,
                r.date.isoformat(),
                r.marked_at.strftime('%H:%M:%S') if r.marked_at else '',
                r.student.roll_no or '',
                r.student.name,
                r.student.branch,
                r.student.year,
                r.student.semester,
                r.student.section,
                r.subject.code if r.subject else '',
                r.subject.name if r.subject else '',
                r.status,
                r.marked_via
            ])
        return response

    # JSON response
    results = [
        {
            "id": r.id,
            "date": r.date.isoformat(),
            "time": r.marked_at.strftime('%H:%M:%S') if r.marked_at else None,
            "student_roll": r.student.roll_no,
            "student_name": r.student.name,
            "branch": r.student.branch,
            "year": r.student.year,
            "semester": r.student.semester,
            "section": r.student.section,
            "subject_code": r.subject.code if r.subject else None,
            "subject_name": r.subject.name if r.subject else None,
            "status": r.status,
            "marked_via": r.marked_via,
        }
        for r in records[:500]
    ]

    return Response({
        "count": records.count(),
        "records": results
    }, status=status.HTTP_200_OK)


# =====================================================================
# 2. LOW ATTENDANCE REPORT & CSV EXPORT
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def low_attendance_report(request):
    """
    Generate report of students with cumulative attendance below a threshold.
    """
    try:
        threshold = float(request.query_params.get('threshold', 75.0))
    except ValueError:
        threshold = 75.0

    branch = request.query_params.get('branch')
    year = request.query_params.get('year')
    section = request.query_params.get('section')
    export_format = request.query_params.get('export', 'json').lower()

    students = Student.objects.filter(is_active=True)
    if branch and branch.upper() != 'ALL':
        students = students.filter(branch__iexact=branch)
    if year and year != 'ALL':
        students = students.filter(year=year)
    if section and section.upper() != 'ALL':
        students = students.filter(section__iexact=section)

    shortage_list = []
    for s in students:
        recs = AttendanceRecord.objects.filter(student=s)
        total = recs.count()
        if total > 0:
            present = recs.filter(status='Present').count()
            rate = round((present / total * 100), 1)
            if rate < threshold:
                # Calculate needed consecutive classes
                req_ratio = threshold / 100.0
                if req_ratio < 1.0:
                    needed = int(round((req_ratio * total - present) / (1 - req_ratio) + 0.49))
                    needed = max(1, needed)
                else:
                    needed = 10

                shortage_list.append({
                    "student_id": s.id,
                    "roll_no": s.roll_no,
                    "name": s.name,
                    "branch": s.branch,
                    "year": s.year,
                    "semester": s.semester,
                    "section": s.section,
                    "email": s.email,
                    "phone": s.phone,
                    "attended": present,
                    "total": total,
                    "percentage": rate,
                    "threshold": threshold,
                    "shortage": round(threshold - rate, 1),
                    "classes_needed": needed
                })

    shortage_list.sort(key=lambda x: x['percentage'])

    AuditLog.log(
        action="REPORT_GENERATE",
        entity="LowAttendanceReport",
        entity_id=0,
        description=f"Generated low attendance shortage report (Threshold: {threshold}%, Found: {len(shortage_list)})",
        request=request
    )

    if export_format == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="low_attendance_shortage_{date.today().isoformat()}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Roll Number', 'Student Name', 'Branch', 'Year', 'Semester', 'Section',
            'Email', 'Phone', 'Classes Attended', 'Total Classes', 'Attendance %',
            'Threshold %', 'Shortage %', 'Classes Needed to Reach Threshold'
        ])

        for s in shortage_list:
            writer.writerow([
                s['roll_no'],
                s['name'],
                s['branch'],
                s['year'],
                s['semester'],
                s['section'],
                s['email'],
                s['phone'],
                s['attended'],
                s['total'],
                s['percentage'],
                s['threshold'],
                s['shortage'],
                s['classes_needed']
            ])
        return response

    return Response({
        "threshold": threshold,
        "count": len(shortage_list),
        "students": shortage_list
    }, status=status.HTTP_200_OK)


# =====================================================================
# 3. STUDENT DIRECTORY ROSTER REPORT & CSV EXPORT
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def student_roster_report(request):
    """
    Institutional student enrollment directory roster report.
    """
    branch = request.query_params.get('branch')
    year = request.query_params.get('year')
    semester = request.query_params.get('semester')
    section = request.query_params.get('section')
    export_format = request.query_params.get('export', 'json').lower()

    students = Student.objects.filter(is_active=True).select_related('academic_class').order_by('branch', 'year', 'section', 'roll_no')
    if branch and branch.upper() != 'ALL':
        students = students.filter(branch__iexact=branch)
    if year and year != 'ALL':
        students = students.filter(year=year)
    if semester and semester != 'ALL':
        students = students.filter(semester=str(semester))
    if section and section.upper() != 'ALL':
        students = students.filter(section__iexact=section)

    AuditLog.log(
        action="REPORT_GENERATE",
        entity="StudentRosterReport",
        entity_id=0,
        description=f"Generated student enrollment roster report ({students.count()} students)",
        request=request
    )

    if export_format == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="student_roster_{date.today().isoformat()}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Student ID', 'Roll Number', 'Full Legal Name', 'Branch',
            'Year', 'Semester', 'Section', 'Email', 'Phone',
            'Academic Cohort', 'Admission Year'
        ])

        for s in students:
            writer.writerow([
                s.student_id or '',
                s.roll_no or '',
                s.name,
                s.branch,
                s.year,
                s.semester,
                s.section,
                s.email,
                s.phone,
                str(s.academic_class) if s.academic_class else '',
                s.admission_year
            ])
        return response

    data = [
        {
            "id": s.id,
            "student_id": s.student_id,
            "roll_no": s.roll_no,
            "name": s.name,
            "branch": s.branch,
            "year": s.year,
            "semester": s.semester,
            "section": s.section,
            "email": s.email,
            "phone": s.phone,
            "academic_class": str(s.academic_class) if s.academic_class else None,
            "admission_year": s.admission_year,
        }
        for s in students
    ]

    return Response({
        "count": students.count(),
        "students": data
    }, status=status.HTTP_200_OK)


# =====================================================================
# 4. PERFORMANCE / GRADEBOOK REPORT & CSV EXPORT
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def performance_report(request):
    """
    Institutional academic performance and marks gradebook report.
    """
    branch = request.query_params.get('branch')
    year = request.query_params.get('year')
    semester = request.query_params.get('semester')
    section = request.query_params.get('section')
    subject_id = request.query_params.get('subject_id')
    export_format = request.query_params.get('export', 'json').lower()

    scores = StudentScore.objects.select_related('student', 'subject').order_by('student__branch', 'student__roll_no', 'subject__code')

    if branch and branch.upper() != 'ALL':
        scores = scores.filter(student__branch__iexact=branch)
    if year and year != 'ALL':
        scores = scores.filter(student__year=year)
    if semester and semester != 'ALL':
        scores = scores.filter(student__semester=str(semester))
    if section and section.upper() != 'ALL':
        scores = scores.filter(student__section__iexact=section)
    if subject_id and subject_id != 'ALL':
        scores = scores.filter(subject_id=subject_id)

    # Faculty assignment authorization check
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin:
        assignments = FacultyAssignment.objects.filter(teacher=request.user)
        if assignments.exists():
            assigned_subs = assignments.values_list('subject_id', flat=True)
            scores = scores.filter(subject_id__in=assigned_subs)

    AuditLog.log(
        action="REPORT_GENERATE",
        entity="PerformanceReport",
        entity_id=0,
        description=f"Generated performance marks report ({scores.count()} evaluations)",
        request=request
    )

    if export_format == 'csv':
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="academic_performance_{date.today().isoformat()}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Roll Number', 'Student Name', 'Branch', 'Year', 'Semester', 'Section',
            'Subject Code', 'Subject Title', 'Credits', 'Internals (40)',
            'End Sem (60)', 'Total Marks (100)', 'Grade', 'Grade Point', 'Result'
        ])

        for sc in scores:
            passed = sc.grade != 'F' and sc.total >= 40.0
            writer.writerow([
                sc.student.roll_no or '',
                sc.student.name,
                sc.student.branch,
                sc.student.year,
                sc.student.semester,
                sc.student.section,
                sc.subject.code,
                sc.subject.name,
                sc.subject.credits,
                sc.internals,
                sc.end_sem,
                sc.total,
                sc.grade,
                sc.grade_point,
                'PASSED' if passed else 'FAILED'
            ])
        return response

    data = [
        {
            "id": sc.id,
            "roll_no": sc.student.roll_no,
            "student_name": sc.student.name,
            "branch": sc.student.branch,
            "year": sc.student.year,
            "semester": sc.student.semester,
            "section": sc.student.section,
            "subject_code": sc.subject.code,
            "subject_name": sc.subject.name,
            "credits": sc.subject.credits,
            "internals": sc.internals,
            "end_sem": sc.end_sem,
            "total": sc.total,
            "grade": sc.grade,
            "grade_point": sc.grade_point,
            "is_passed": sc.grade != 'F' and sc.total >= 40.0
        }
        for sc in scores[:500]
    ]

    return Response({
        "count": scores.count(),
        "scores": data
    }, status=status.HTTP_200_OK)
