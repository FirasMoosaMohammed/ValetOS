from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db.models import Count
from .models import User


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['role'] = user.role
        token['full_name'] = user.get_full_name() or user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'role': self.user.role,
            'full_name': self.user.get_full_name() or self.user.username,
            'is_on_shift': self.user.is_on_shift,
        }
        return data


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name', 'role', 'phone', 'is_on_shift']
        read_only_fields = ['id', 'is_on_shift']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class StaffSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    total_sessions = serializers.SerializerMethodField()
    active_sessions = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, min_length=6, required=False)
    confirm_password = serializers.CharField(write_only=True, min_length=6, required=False)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'phone', 'is_active', 'is_on_shift', 'last_assigned_at',
            'date_joined', 'total_sessions', 'active_sessions',
            'password', 'confirm_password',
        ]
        read_only_fields = ['id', 'date_joined', 'last_assigned_at']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    def get_total_sessions(self, obj):
        return obj.sessions_handled.count()

    def get_active_sessions(self, obj):
        return obj.sessions_handled.filter(status='active').count()

    def validate(self, data):
        pw = data.get('password')
        cpw = data.get('confirm_password')
        if pw or cpw:
            if pw != cpw:
                raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password', None)
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        validated_data.pop('confirm_password', None)
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
