from rest_framework import serializers
from .models import (
    Subject,
    Assessment,
    Marks,
    StudentScore,
    ExamSession,
    ExamTimetable,
    HallTicket,
)


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'code', 'name', 'department', 'branch', 'semester', 'credits', 'is_active']


class AssessmentSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)

    class Meta:
        model = Assessment
        fields = ['id', 'name', 'subject', 'subject_code', 'max_marks', 'weightage_percent', 'semester']


class MarksSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    assessment_name = serializers.CharField(source='assessment.name', read_only=True)

    class Meta:
        model = Marks
        fields = [
            'id',
            'student',
            'student_name',
            'roll_no',
            'subject',
            'subject_code',
            'subject_name',
            'assessment',
            'assessment_name',
            'marks_obtained',
            'grade',
            'grade_point',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'grade', 'grade_point', 'created_at', 'updated_at']

    def validate_marks_obtained(self, value):
        if value < 0:
            raise serializers.ValidationError("Marks cannot be negative.")
        return value


class StudentScoreSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    credits = serializers.IntegerField(source='subject.credits', read_only=True)

    class Meta:
        model = StudentScore
        fields = [
            'id',
            'student',
            'student_name',
            'roll_no',
            'subject',
            'subject_code',
            'subject_name',
            'credits',
            'internals',
            'end_sem',
            'total',
            'grade',
            'grade_point',
            'grade_class',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'total', 'grade', 'grade_point', 'grade_class', 'created_at', 'updated_at']
 

class ExamTimetableSerializer(serializers.ModelSerializer):
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_credits = serializers.IntegerField(source='subject.credits', read_only=True)

    class Meta:
        model = ExamTimetable
        fields = [
            'id',
            'exam_session',
            'subject',
            'subject_code',
            'subject_name',
            'subject_credits',
            'exam_date',
            'start_time',
            'end_time',
            'hall_number',
            'order',
        ]


class ExamSessionSerializer(serializers.ModelSerializer):
    exam_type_display = serializers.CharField(source='get_exam_type_display', read_only=True)
    timetable = ExamTimetableSerializer(many=True, read_only=True)
    papers_count = serializers.SerializerMethodField()
    hall_tickets_count = serializers.SerializerMethodField()

    class Meta:
        model = ExamSession
        fields = [
            'id',
            'name',
            'academic_year',
            'exam_type',
            'exam_type_display',
            'branch',
            'semester',
            'start_date',
            'end_date',
            'min_attendance_percentage',
            'is_published',
            'instructions',
            'papers_count',
            'hall_tickets_count',
            'timetable',
            'created_at',
            'updated_at',
        ]

    def get_papers_count(self, obj):
        return obj.timetable.count()

    def get_hall_tickets_count(self, obj):
        return obj.hall_tickets.count()


class HallTicketSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    student_id_code = serializers.CharField(source='student.student_id', read_only=True)
    branch = serializers.CharField(source='student.branch', read_only=True)
    semester = serializers.CharField(source='student.semester', read_only=True)
    section = serializers.CharField(source='student.section', read_only=True)
    email = serializers.CharField(source='student.email', read_only=True)
    exam_session_name = serializers.CharField(source='exam_session.name', read_only=True)
    academic_year = serializers.CharField(source='exam_session.academic_year', read_only=True)
    exam_type = serializers.CharField(source='exam_session.get_exam_type_display', read_only=True)
    instructions = serializers.CharField(source='exam_session.instructions', read_only=True)
    min_attendance = serializers.FloatField(source='exam_session.min_attendance_percentage', read_only=True)
    is_published = serializers.BooleanField(source='exam_session.is_published', read_only=True)
    condoned_by_name = serializers.SerializerMethodField()
    timetable = serializers.SerializerMethodField()

    class Meta:
        model = HallTicket
        fields = [
            'id',
            'exam_session',
            'exam_session_name',
            'academic_year',
            'exam_type',
            'student',
            'student_name',
            'roll_no',
            'student_id_code',
            'branch',
            'semester',
            'section',
            'email',
            'hall_ticket_number',
            'verification_token',
            'calculated_attendance_pct',
            'min_attendance',
            'is_eligible',
            'is_condoned',
            'condonation_reason',
            'condoned_by_name',
            'condoned_at',
            'instructions',
            'is_published',
            'timetable',
            'created_at',
        ]

    def get_condoned_by_name(self, obj):
        if obj.condoned_by:
            name = obj.condoned_by.get_full_name()
            return name if name.strip() else obj.condoned_by.username
        return None

    def get_timetable(self, obj):
        papers = obj.exam_session.timetable.all()
        student_branch = (obj.student.branch or '').strip().upper()
        student_sem = str(obj.student.semester or '').strip()

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

        return ExamTimetableSerializer(relevant_papers, many=True).data

