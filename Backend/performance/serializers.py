from rest_framework import serializers
from .models import Subject, StudentScore
from students.serializers import StudentSerializer


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'code', 'name', 'branch', 'semester', 'credits']


class StudentScoreSerializer(serializers.ModelSerializer):
    subject_details = SubjectSerializer(source='subject', read_only=True)
    student_name = serializers.CharField(source='student.name', read_only=True)
    roll_no = serializers.CharField(source='student.roll_no', read_only=True)
    branch = serializers.CharField(source='student.branch', read_only=True)

    class Meta:
        model = StudentScore
        fields = [
            'id', 'student', 'student_name', 'roll_no', 'branch',
            'subject', 'subject_details',
            'internals', 'end_sem', 'total', 'grade', 'grade_class',
            'created_at'
        ]
