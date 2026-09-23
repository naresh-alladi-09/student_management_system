from rest_framework import serializers
from .models import AttendanceSession, AttendanceRecord
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
