from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_notifications(request):
    """
    Get notifications for the logged in user along with unread count.
    """
    notifications = Notification.objects.filter(user=request.user)[:30]
    unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
    serializer = NotificationSerializer(notifications, many=True)
    return Response({
        "unread_count": unread_count,
        "notifications": serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_notification_read(request, notification_id=None):
    """
    Mark a single notification or all notifications as read.
    """
    if notification_id:
        Notification.objects.filter(id=notification_id, user=request.user).update(is_read=True)
    else:
        # Mark all as read
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)

    return Response({"message": "Notifications updated."}, status=status.HTTP_200_OK)
