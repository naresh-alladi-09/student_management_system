from rest_framework import serializers
from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    author_username = serializers.CharField(source='created_by.username', read_only=True)

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
            'is_active',
            'created_at',
            'expires_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at']
