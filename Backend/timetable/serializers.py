from rest_framework import serializers
from .models import TimetableSlot
from performance.serializers import SubjectSerializer


class TimetableSlotSerializer(serializers.ModelSerializer):
    subject_details = SubjectSerializer(source='subject', read_only=True)
    teacher_name = serializers.SerializerMethodField()
    academic_class_name = serializers.SerializerMethodField()

    class Meta:
        model = TimetableSlot
        fields = [
            'id',
            'subject',
            'subject_details',
            'teacher',
            'teacher_name',
            'day',
            'start_time',
            'end_time',
            'room',
            'branch',
            'year',
            'semester',
            'section',
            'academic_class',
            'academic_class_name',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_teacher_name(self, obj):
        if not obj.teacher:
            return "Unassigned"
        full = obj.teacher.get_full_name()
        return full if full.strip() else obj.teacher.username

    def get_academic_class_name(self, obj):
        return str(obj.academic_class) if obj.academic_class else f"{obj.branch} Y{obj.year}S{obj.semester}-{obj.section}"

