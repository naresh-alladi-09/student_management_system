from rest_framework import serializers
from .models import Subject, Assessment, Marks, StudentScore


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
