from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile
from students.serializers import StudentSerializer


class UserProfileSerializer(serializers.ModelSerializer):
    student = StudentSerializer(read_only=True)
    user_id_code = serializers.CharField(read_only=True)

    class Meta:
        model = UserProfile
        fields = ['role', 'phone', 'department', 'student', 'employee_id', 'user_id_code', 'profile_pic']


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(read_only=True)
    user_id_code = serializers.CharField(source='profile.user_id_code', read_only=True)
    profile_pic = serializers.CharField(source='profile.profile_pic', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'profile', 'user_id_code', 'profile_pic']

