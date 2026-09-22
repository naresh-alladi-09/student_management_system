from rest_framework import serializers
from .models import TimetableSlot
from performance.serializers import SubjectSerializer


class TimetableSlotSerializer(serializers.ModelSerializer):
    subject_details = SubjectSerializer(source='subject', read_only=True)
    teacher_name = serializers.CharField(source='teacher.get_full_name', read_only=True)

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
            'semester',
            'section',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
