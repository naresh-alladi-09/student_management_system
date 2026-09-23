from django.db.models import Q, Count
from django.utils import timezone
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from accounts.permissions import IsAdmin
from .models import AuditLog
from .serializers import AuditLogSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin])
def list_audit_logs(request):
    """
    Admin-only endpoint to inspect institutional audit trails.
    Supports comprehensive keyword search, action/entity/date filtering, and server-side pagination.
    """
    qs = AuditLog.objects.all().select_related('user').order_by('-timestamp')

    action = request.query_params.get('action', None)
    if action and action.upper() != 'ALL':
        qs = qs.filter(action=action)

    entity = request.query_params.get('entity', None)
    if entity and entity.upper() != 'ALL':
        qs = qs.filter(entity__iexact=entity)

    user_id = request.query_params.get('user_id', None)
    if user_id:
        qs = qs.filter(user_id=user_id)

    date_from = request.query_params.get('date_from', None)
    if date_from:
        qs = qs.filter(timestamp__date__gte=date_from)

    date_to = request.query_params.get('date_to', None)
    if date_to:
        qs = qs.filter(timestamp__date__lte=date_to)

    search = request.query_params.get('search', None)
    if search:
        s = search.strip()
        qs = qs.filter(
            Q(description__icontains=s) |
            Q(entity_id__icontains=s) |
            Q(ip_address__icontains=s) |
            Q(user__username__icontains=s) |
            Q(user__first_name__icontains=s) |
            Q(user__last_name__icontains=s)
        )

    # Server-side pagination
    try:
        page_size = int(request.query_params.get('page_size', 25))
        if page_size < 1:
            page_size = 25
        elif page_size > 100:
            page_size = 100
    except (ValueError, TypeError):
        page_size = 25

    paginator = Paginator(qs, page_size)
    page_param = request.query_params.get('page', 1)

    try:
        page_obj = paginator.page(page_param)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages if paginator.num_pages > 0 else 1)

    serializer = AuditLogSerializer(page_obj.object_list, many=True)

    return Response({
        "total": paginator.count,
        "page": page_obj.number if paginator.count > 0 else 1,
        "page_size": page_size,
        "total_pages": paginator.num_pages,
        "has_next": page_obj.has_next() if paginator.count > 0 else False,
        "has_previous": page_obj.has_previous() if paginator.count > 0 else False,
        "results": serializer.data,
        "logs": serializer.data  # Backward compatibility for frontend
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdmin])
def get_audit_stats(request):
    """
    Returns operational summary statistics for system administrators.
    """
    total = AuditLog.objects.count()
    today = timezone.now().date()
    today_count = AuditLog.objects.filter(timestamp__date=today).count()

    action_breakdown = list(
        AuditLog.objects.values('action')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )

    auth_count = AuditLog.objects.filter(action__in=['LOGIN', 'LOGOUT']).count()
    academic_count = AuditLog.objects.filter(
        action__in=[
            'STUDENT_CREATE', 'STUDENT_UPDATE', 'STUDENT_DEACTIVATE', 'STUDENT_ACTIVATE',
            'MARKS_UPDATE', 'ATTENDANCE_SESSION_START', 'ATTENDANCE_SESSION_CLOSE',
            'ATTENDANCE_QR_MARK', 'REPORT_GENERATE', 'TIMETABLE_CREATE'
        ]
    ).count()

    return Response({
        "total_logs": total,
        "today_logs": today_count,
        "auth_events_count": auth_count,
        "academic_events_count": academic_count,
        "action_breakdown": action_breakdown
    }, status=status.HTTP_200_OK)
