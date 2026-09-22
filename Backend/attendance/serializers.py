from rest_framework import serializers
from .models import AttendanceRecord
from students.serializers import StudentSerializer


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_details = StudentSerializer(source='student', read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = ['id', 'student', 'student_details', 'date', 'status', 'remarks', 'created_at']
