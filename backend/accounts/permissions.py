from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """Allow access only to users with role='admin'."""
    message = 'Only admin users can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'admin'
        )


class IsValetRole(BasePermission):
    """Allow access only to users with role='attendant' (valet)."""
    message = 'Only valet staff can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ('admin', 'attendant')
        )


class IsAdminOrValet(BasePermission):
    """Allow both admin and valet."""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ('admin', 'attendant')
        )
