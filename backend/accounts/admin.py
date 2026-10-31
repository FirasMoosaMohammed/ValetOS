from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'role', 'is_on_shift', 'is_active']
    list_filter = ['role', 'is_active', 'is_on_shift']
    fieldsets = UserAdmin.fieldsets + (
        ('ValetOS', {'fields': ('role', 'phone', 'is_on_shift', 'last_assigned_at')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('ValetOS', {'fields': ('role', 'phone')}),
    )
    readonly_fields = ['last_assigned_at']
