from rest_framework import serializers
from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    author_username = serializers.CharField(source='created_by.username', read_only=True)
    academic_class_name = serializers.StringRelatedField(source='academic_class', read_only=True)

    class Meta:
        model = Announcement
        fields = [
            'id',
            'title',
            'description',
            'created_by',
            'author_name',
            'author_username',
            'department',
            'priority',
            'target_audience',
            'branch',
            'year',
            'semester',
            'section',
            'academic_class',
            'academic_class_name',
            'is_active',
            'created_at',
            'expires_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']

