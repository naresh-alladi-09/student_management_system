from rest_framework import serializers
from .models import Student


class StudentSerializer(serializers.ModelSerializer):
    roll_number = serializers.CharField(source='roll_no', read_only=True)

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
            'admission_year',
            'profile_photo',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student_id', 'created_at', 'updated_at']

    def validate_email(self, value):
        instance = self.instance
        qs = Student.objects.filter(email__iexact=value)
        if instance:
            qs = qs.exclude(pk=instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A student with this email address already exists.")
        return value.lower()

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
            raise serializers.ValidationError("Academic year must be between 1 and 5.")
        return value