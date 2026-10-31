from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('attendant', 'Attendant'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='attendant')
    phone = models.CharField(max_length=20, blank=True)
    # Shift management (Feature: automated attendant assignment)
    is_on_shift = models.BooleanField(default=False)
    last_assigned_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    def save(self, *args, **kwargs):
        if self.is_superuser and self.role != 'admin':
            self.role = 'admin'
        super().save(*args, **kwargs)

    @property
    def is_admin_role(self):
        return self.role == 'admin'
