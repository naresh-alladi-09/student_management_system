from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from accounts.permissions import IsAdmin
from .models import AuditLog
from .serializers import AuditLogSerializer


@api_view(['GET'])
@permission_classes([IsAdmin])
def list_audit_logs(request):
    """
    Admin-only endpoint to inspect system audit trails.
    Supports ?action=LOGIN or ?entity=Student
    """
    qs = AuditLog.objects.all().select_related('user')

    action = request.query_params.get('action', None)
    if action:
        qs = qs.filter(action=action)

    entity = request.query_params.get('entity', None)
    if entity:
        qs = qs.filter(entity__iexact=entity)

    logs = qs[:100]
    serializer = AuditLogSerializer(logs, many=True)
    return Response({
        "total": qs.count(),
        "logs": serializer.data
    }, status=status.HTTP_200_OK)
