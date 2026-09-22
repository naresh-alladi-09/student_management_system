from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudentViewSet, health_check

router = DefaultRouter()
router.register(r'', StudentViewSet, basename='student')

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('students/', include(router.urls)),
]