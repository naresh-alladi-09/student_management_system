from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id',
            'user',
            'username',
            'user_name',
            'action',
            'entity',
            'entity_id',
            'description',
            'ip_address',
            'timestamp',
        ]
        read_only_fields = ['id', 'timestamp']
