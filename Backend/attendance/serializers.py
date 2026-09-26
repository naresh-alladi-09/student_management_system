from rest_framework import serializers
from .models import AttendanceSession, AttendanceRecord, LeaveRequest
from performance.serializers import SubjectSerializer
from students.serializers import StudentSerializer


class AttendanceSessionSerializer(serializers.ModelSerializer):
    subject_details = SubjectSerializer(source='subject', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    class_display = serializers.CharField(source='academic_class.display_name', read_only=True)
    is_expired = serializers.SerializerMethodField()
    attendees_count = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceSession
        fields = [
            'id',
            'subject',
            'subject_details',
            'teacher',
            'teacher_name',
            'academic_class',
            'class_display',
            'section',
            'date',
            'start_time',
            'end_time',
            'qr_token',
            'expires_at',
            'duration_seconds',
            'is_active',
            'is_expired',
            'attendees_count',
            'created_at',
        ]
        read_only_fields = ['id', 'teacher', 'qr_token', 'expires_at', 'created_at']

    def get_is_expired(self, obj):
        return obj.is_expired()

    def get_attendees_count(self, obj):
        return obj.records.filter(status='Present').count()


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = [
            'id',
            'student',
            'student_name',
            'roll_no',
            'session',
            'subject',
            'subject_name',
            'subject_code',
            'date',
            'status',
            'marked_via',
            'remarks',
            'marked_at',
        ]
        read_only_fields = ['id', 'marked_at']


class LeaveRequestSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    student_id_code = serializers.CharField(source='student.student_id', read_only=True)
    branch = serializers.CharField(source='student.branch', read_only=True)
    semester = serializers.CharField(source='student.semester', read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    total_days = serializers.ReadOnlyField()

    class Meta:
        model = LeaveRequest
        fields = [
            'id',
            'student',
            'student_name',
            'roll_no',
            'student_id_code',
            'branch',
            'semester',
            'leave_type',
            'leave_type_display',
            'start_date',
            'end_date',
            'total_days',
            'reason',
            'document_url',
            'status',
            'status_display',
            'reviewed_by',
            'reviewed_by_name',
            'reviewer_remarks',
            'reviewed_at',
            'applied_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'student',
            'status',
            'reviewed_by',
            'reviewer_remarks',
            'reviewed_at',
            'applied_at',
            'updated_at',
        ]

    def get_reviewed_by_name(self, obj):
        if obj.reviewed_by:
            name = obj.reviewed_by.get_full_name()
            return name if name.strip() else obj.reviewed_by.username
        return None

