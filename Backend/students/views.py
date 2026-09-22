import time
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db import connection
from .models import Student
from .serializers import StudentSerializer


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.all().order_by('-id')
    serializer_class = StudentSerializer


@api_view(['GET'])
def health_check(request):
    """
    Health check endpoint to verify backend and database connectivity.
    """
    start_time = time.time()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        latency_ms = round((time.time() - start_time) * 1000, 2)
        student_count = Student.objects.count()
        return Response({
            "status": "healthy",
            "database": "connected",
            "database_vendor": connection.vendor,
            "latency_ms": latency_ms,
            "total_students": student_count,
            "message": "Connected to database successfully without errors."
        }, status=status.HTTP_200_OK)
    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000, 2)
        return Response({
            "status": "unhealthy",
            "database": "disconnected",
            "latency_ms": latency_ms,
            "error": str(e)
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)