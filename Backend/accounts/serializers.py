from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile
from students.serializers import StudentSerializer


class UserProfileSerializer(serializers.ModelSerializer):
    student = StudentSerializer(read_only=True)

    class Meta:
        model = UserProfile
        fields = ['role', 'phone', 'department', 'student']


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'profile']
