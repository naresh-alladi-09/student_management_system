import re
from rest_framework import serializers
from .models import Department, Branch, AcademicClass, FacultyAssignment, Student


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'code', 'name', 'created_at']


class BranchSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)

    class Meta:
        model = Branch
        fields = ['id', 'department', 'department_code', 'department_name', 'code', 'name', 'created_at']


class AcademicClassSerializer(serializers.ModelSerializer):
    branch_code = serializers.CharField(source='branch.code', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = AcademicClass
        fields = [
            'id',
            'branch',
            'branch_code',
            'branch_name',
            'year',
            'semester',
            'section',
            'academic_year',
            'display_name',
            'created_at',
        ]


class FacultyAssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)
    teacher_username = serializers.CharField(source='teacher.username', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)
    class_display = serializers.CharField(source='academic_class.display_name', read_only=True)

    class Meta:
        model = FacultyAssignment
        fields = [
            'id',
            'teacher',
            'teacher_username',
            'teacher_name',
            'subject',
            'subject_code',
            'subject_name',
            'academic_class',
            'class_display',
            'created_at',
        ]


class StudentSerializer(serializers.ModelSerializer):
    roll_number = serializers.CharField(source='roll_no', read_only=True)
    academic_class_display = serializers.CharField(source='academic_class.display_name', read_only=True)

    class Meta:
        model = Student
        fields = [
            'id',
            'student_id',
            'roll_no',
            'roll_number',
            'name',
            'email',
            'phone',
            'date_of_birth',
            'department',
            'branch',
            'year',
            'semester',
            'section',
            'academic_class',
            'academic_class_display',
            'admission_year',
            'profile_photo',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student_id', 'created_at', 'updated_at']

    def validate_name(self, value):
        val = (value or '').strip()
        if not val:
            raise serializers.ValidationError("Student full name is required.")
        if val.isdigit() or re.match(r'^\d+$', val):
            raise serializers.ValidationError("Student name must contain letters and cannot be numeric.")
        if not re.search(r'[a-zA-Z]', val):
            raise serializers.ValidationError("Student name must contain valid alphabetic characters.")
        if not re.match(r"^[a-zA-Z\s.'-]+$", val):
            raise serializers.ValidationError("Student name can only contain letters, spaces, hyphens, and periods.")
        return val

    def validate_phone(self, value):
        val = str(value or '').strip()
        digits = re.sub(r'[\s\-+()]', '', val)
        if not digits.isdigit():
            raise serializers.ValidationError("Phone number must contain only numeric digits (no letters or symbols).")
        if len(digits) < 10 or len(digits) > 15:
            raise serializers.ValidationError("Phone number must be between 10 and 15 digits.")
        return digits

    def validate_email(self, value):
        val = (value or '').strip().lower()
        if not val:
            raise serializers.ValidationError("Email address is required.")
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, val):
            raise serializers.ValidationError("Please enter a valid email address (e.g. student@college.edu).")

        instance = self.instance
        qs = Student.objects.filter(email__iexact=val)
        if instance:
            qs = qs.exclude(pk=instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A student with this email address already exists.")
        return val

    def validate_roll_no(self, value):
        if value:
            instance = self.instance
            qs = Student.objects.filter(roll_no__iexact=value)
            if instance:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                raise serializers.ValidationError(f"Roll number '{value}' is already taken.")
        return value

    def validate_year(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Academic year must be between 1 and 4.")
        return value

    def validate_semester(self, value):
        try:
            sem_int = int(str(value).strip())
            if sem_int < 1 or sem_int > 8:
                raise serializers.ValidationError("Semester must be between 1 and 8.")
            return str(sem_int)
        except (ValueError, TypeError):
            raise serializers.ValidationError("Semester must be a valid number between 1 and 8.")