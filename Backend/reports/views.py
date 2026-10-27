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


def build_timetable_slot_order_map():
    """
    Builds a lookup mapping timetable_slot_id -> period_number (1, 2, 3...)
    based on ascending start_time within each academic cohort/class and day.
    """
    try:
        from timetable.models import TimetableSlot
        slots = TimetableSlot.objects.all().order_by('start_time')
        class_day_slots = {}
        for s in slots:
            c_key = s.academic_class_id or f"{s.branch}_{s.year}_{s.semester}_{s.section}"
            key = (c_key, s.day.lower())
            if key not in class_day_slots:
                class_day_slots[key] = []
            class_day_slots[key].append(s)

        slot_order_map = {}
        for key, s_list in class_day_slots.items():
            s_list.sort(key=lambda x: x.start_time)
            for idx, s in enumerate(s_list, start=1):
                slot_order_map[s.id] = idx
        return slot_order_map
    except Exception:
        return {}


def resolve_period_metadata(record, slot_order_map=None):
    """
    Resolves (period_number, period_timings_string, period_display_label)
    for an AttendanceRecord.
    """
    if slot_order_map is None:
        slot_order_map = {}

    slot = record.timetable_slot
    if not slot and record.session:
        slot = record.session.timetable_slot

    period_num = None
    start_t = None
    end_t = None

    if slot:
        period_num = slot_order_map.get(slot.id)
        start_t = slot.start_time
        end_t = slot.end_time
    elif record.session and record.session.start_time and record.session.end_time:
        start_t = record.session.start_time
        end_t = record.session.end_time
    elif record.marked_at:
        start_t = record.marked_at.time()

    # Heuristic period numbering from start time if slot wasn't mapped
    if period_num is None and start_t:
        t_minutes = start_t.hour * 60 + start_t.minute
        if t_minutes < 595:       # Before 09:55 AM -> Period 1
            period_num = 1
        elif t_minutes < 660:     # 09:55 - 11:00 AM -> Period 2
            period_num = 2
        elif t_minutes < 730:     # 11:00 AM - 12:10 PM -> Period 3
            period_num = 3
        elif t_minutes < 810:     # 12:10 - 01:30 PM -> Period 4
            period_num = 4
        elif t_minutes < 895:     # 01:30 - 02:55 PM -> Period 5
            period_num = 5
        elif t_minutes < 955:     # 02:55 - 03:55 PM -> Period 6
            period_num = 6
        elif t_minutes < 1015:    # 03:55 - 04:55 PM -> Period 7
            period_num = 7
        else:
            period_num = 8
    elif period_num is None:
        period_num = 1

    if start_t and end_t:
        time_str = f"{start_t.strftime('%I:%M %p')} - {end_t.strftime('%I:%M %p')}"
    elif start_t:
        time_str = start_t.strftime('%I:%M %p')
    else:
        time_str = "09:00 AM - 09:50 AM"

    display_label = f"Period {period_num} ({time_str})"
    return period_num, time_str, display_label


# =====================================================================
# 1. ATTENDANCE REPORT & CSV EXPORT
# =====================================================================

@api_view(['GET'])
@permission_classes([IsTeacherOrAdmin])
def attendance_report(request):
    """
    Generate attendance report calculated per period from one date to another date for each student ID.
    Supports:
      - ?view_mode=detailed (default): Period-by-period calculation entry with student cumulative period stats.
      - ?view_mode=summary: Aggregate calculation row for each student ID across all periods in the date range.
      - ?export=csv: Downloadable CSV calculation export.
      - ?export=json: Interactive JSON preview for reporting table.
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
    view_mode = request.query_params.get('view_mode', 'detailed').lower()

    records = AttendanceRecord.objects.select_related(
        'student', 'subject', 'timetable_slot', 'session', 'session__timetable_slot'
    ).order_by('date', 'marked_at', 'id')

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
    if student_id and str(student_id).strip() and str(student_id).upper() != 'ALL':
        s_val = str(student_id).strip()
        stu_q = Q(student__student_id__iexact=s_val) | Q(student__roll_no__iexact=s_val) | Q(student__name__icontains=s_val)
        if s_val.isdigit():
            stu_q |= Q(student_id=int(s_val))
        records = records.filter(stu_q)
    if date_from and str(date_from).strip():
        records = records.filter(date__gte=str(date_from).strip())
    if date_to and str(date_to).strip():
        records = records.filter(date__lte=str(date_to).strip())

    # Faculty assignment isolation check for teachers
    is_admin = request.user.is_staff or getattr(getattr(request.user, 'profile', None), 'role', '') == 'admin'
    if not is_admin:
        assignments = FacultyAssignment.objects.filter(teacher=request.user)
        if assignments.exists():
            assigned_sub_ids = assignments.values_list('subject_id', flat=True)
            records = records.filter(subject_id__in=assigned_sub_ids)

    # Build period lookup map
    slot_order_map = build_timetable_slot_order_map()

    # Pre-calculate period metrics per student ID across the date range
    student_period_stats = {}
    for r in records:
        stu = r.student
        s_pk = stu.id
        if s_pk not in student_period_stats:
            student_period_stats[s_pk] = {
                'id': stu.id,
                'student_id': stu.student_id or f"STU{stu.id:04d}",
                'roll_no': stu.roll_no or '',
                'name': stu.name,
                'branch': stu.branch,
                'year': stu.year,
                'semester': stu.semester,
                'section': stu.section,
                'date_from': date_from or '',
                'date_to': date_to or '',
                'total_periods': 0,
                'periods_present': 0,
                'periods_od': 0,
                'periods_medical': 0,
                'periods_late': 0,
                'periods_absent': 0,
                'periods_attended': 0,
            }

        st = r.status
        student_period_stats[s_pk]['total_periods'] += 1
        if st == 'Present':
            student_period_stats[s_pk]['periods_present'] += 1
            student_period_stats[s_pk]['periods_attended'] += 1
        elif st == 'On-Duty':
            student_period_stats[s_pk]['periods_od'] += 1
            student_period_stats[s_pk]['periods_attended'] += 1
        elif st == 'Medical':
            student_period_stats[s_pk]['periods_medical'] += 1
            student_period_stats[s_pk]['periods_attended'] += 1
        elif st == 'Late':
            student_period_stats[s_pk]['periods_late'] += 1
            student_period_stats[s_pk]['periods_attended'] += 1
        elif st == 'Absent':
            student_period_stats[s_pk]['periods_absent'] += 1
        else:
            student_period_stats[s_pk]['periods_absent'] += 1

    for s_pk, s_data in student_period_stats.items():
        tot = s_data['total_periods']
        att = s_data['periods_attended']
        pct = round((att / tot * 100), 2) if tot > 0 else 0.0
        s_data['period_percentage'] = pct
        s_data['eligibility_status'] = 'Eligible (>=75%)' if pct >= 75.0 else 'Shortage (<75%)'
        s_data['shortage_percentage'] = round(max(0.0, 75.0 - pct), 1)

    # Audit logging
    AuditLog.log(
        action="REPORT_GENERATE",
        entity="AttendanceReport",
        entity_id=0,
        description=f"Generated attendance report (Branch: {branch}, Year: {year}, Student: {student_id}, From: {date_from}, To: {date_to}, Mode: {view_mode}, Format: {export_format})",
        request=request
    )

    if export_format == 'csv':
        response = HttpResponse(content_type='text/csv')
        filename_prefix = "period_summary" if view_mode == 'summary' else "period_detailed"
        response['Content-Disposition'] = f'attachment; filename="attendance_report_{filename_prefix}_{date.today().isoformat()}.csv"'

        writer = csv.writer(response)

        if view_mode == 'summary':
            # Export one row per student ID calculating total period attendance in date range
            writer.writerow([
                'Student ID', 'Roll Number', 'Student Name', 'Branch', 'Year',
                'Semester', 'Section', 'Date From', 'Date To', 'Total Periods Held',
                'Periods Present', 'Periods On-Duty', 'Periods Medical', 'Periods Late',
                'Periods Absent', 'Total Periods Attended', 'Period Attendance %',
                'Eligibility Status', 'Shortage %'
            ])
            for s_pk, s_data in student_period_stats.items():
                writer.writerow([
                    s_data['student_id'],
                    s_data['roll_no'],
                    s_data['name'],
                    s_data['branch'],
                    s_data['year'],
                    s_data['semester'],
                    s_data['section'],
                    date_from or s_data.get('date_from') or 'All Available',
                    date_to or s_data.get('date_to') or 'All Available',
                    s_data['total_periods'],
                    s_data['periods_present'],
                    s_data['periods_od'],
                    s_data['periods_medical'],
                    s_data['periods_late'],
                    s_data['periods_absent'],
                    s_data['periods_attended'],
                    f"{s_data['period_percentage']}%",
                    s_data['eligibility_status'],
                    f"{s_data['shortage_percentage']}%"
                ])
            return response

        # Default Detailed Mode: Period-by-period calculation entry per student ID
        writer.writerow([
            'Record ID', 'Date', 'Period Number', 'Period Timings', 'Time',
            'Student ID', 'Roll Number', 'Student Name', 'Branch', 'Year',
            'Semester', 'Section', 'Subject Code', 'Subject Title', 'Status',
            'Period Credit (1/0)', 'Student Total Periods In Range',
            'Student Attended In Range', 'Student Absent In Range',
            'Student Period Attendance %', 'Eligibility Status', 'Marked Via'
        ])

        for r in records:
            p_num, p_time, p_label = resolve_period_metadata(r, slot_order_map)
            is_attended = r.status in ['Present', 'On-Duty', 'Medical', 'Late']
            credit = 1 if is_attended else 0
            stu_stats = student_period_stats.get(r.student_id, {})

            writer.writerow([
                r.id,
                r.date.isoformat(),
                f"Period {p_num}",
                p_time,
                r.marked_at.strftime('%H:%M:%S') if r.marked_at else '',
                r.student.student_id or f"STU{r.student.id:04d}",
                r.student.roll_no or '',
                r.student.name,
                r.student.branch,
                r.student.year,
                r.student.semester,
                r.student.section,
                r.subject.code if r.subject else '',
                r.subject.name if r.subject else '',
                r.status,
                credit,
                stu_stats.get('total_periods', 0),
                stu_stats.get('periods_attended', 0),
                stu_stats.get('periods_absent', 0),
                f"{stu_stats.get('period_percentage', 0.0)}%",
                stu_stats.get('eligibility_status', 'N/A'),
                r.marked_via
            ])
        return response

    # JSON response for preview
    results = []
    for r in records[:500]:
        p_num, p_time, p_label = resolve_period_metadata(r, slot_order_map)
        is_attended = r.status in ['Present', 'On-Duty', 'Medical', 'Late']
        stu_stats = student_period_stats.get(r.student_id, {})

        results.append({
            "id": r.id,
            "date": r.date.isoformat(),
            "time": r.marked_at.strftime('%H:%M:%S') if r.marked_at else None,
            "period_number": p_num,
            "period_time": p_time,
            "period_label": p_label,
            "student_id": r.student.student_id or f"STU{r.student.id:04d}",
            "student_roll": r.student.roll_no,
            "student_name": r.student.name,
            "branch": r.student.branch,
            "year": r.student.year,
            "semester": r.student.semester,
            "section": r.student.section,
            "subject_code": r.subject.code if r.subject else None,
            "subject_name": r.subject.name if r.subject else None,
            "status": r.status,
            "period_credit": 1 if is_attended else 0,
            "student_total_periods": stu_stats.get('total_periods', 0),
            "student_attended_periods": stu_stats.get('periods_attended', 0),
            "student_absent_periods": stu_stats.get('periods_absent', 0),
            "student_period_percentage": stu_stats.get('period_percentage', 0.0),
            "student_eligibility": stu_stats.get('eligibility_status', 'N/A'),
            "marked_via": r.marked_via,
            "attendance_mode": "QR" if (r.marked_via and (r.marked_via == 'QR' or r.marked_via == 'QR_FACE_GEO' or r.marked_via.startswith('QR'))) else "Manual",
        })

    return Response({
        "count": records.count(),
        "view_mode": view_mode,
        "date_from": date_from,
        "date_to": date_to,
        "period_metrics": {
            "total_period_records": records.count(),
            "unique_students": len(student_period_stats),
            "average_period_percentage": round(
                sum(s['period_percentage'] for s in student_period_stats.values()) / max(1, len(student_period_stats)),
                1
            ) if student_period_stats else 0.0
        },
        "records": results,
        "student_summaries": list(student_period_stats.values())
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
