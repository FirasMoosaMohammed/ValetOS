from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q

from .serializers import CustomTokenObtainPairSerializer, UserSerializer, UserCreateSerializer, StaffSerializer
from .models import User
from .permissions import IsAdminRole


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Always fetch fresh from DB so is_on_shift reflects admin changes in real-time
        return User.objects.get(pk=self.request.user.pk)

    def retrieve(self, request, *args, **kwargs):
        user = self.get_object()
        return Response(UserSerializer(user).data)


class StaffListCreateView(generics.ListCreateAPIView):
    serializer_class = StaffSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        today = timezone.localdate()
        qs = User.objects.filter(role='attendant').annotate(
            active_tasks=Count(
                'assigned_tickets',
                filter=Q(assigned_tickets__status__in=['valet_assigned', 'parked', 'retrieval_pending'])
            ),
            today_tasks=Count(
                'assigned_tickets',
                filter=Q(assigned_tickets__entry_time__date=today)
            ),
        ).order_by('first_name', 'username')
        return qs

    def perform_create(self, serializer):
        serializer.save(role='attendant')


class StaffDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = StaffSerializer
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        return User.objects.filter(role='attendant')

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class StartShiftView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        try:
            attendant = User.objects.get(pk=pk, role='attendant')
        except User.DoesNotExist:
            return Response({'error': 'Attendant not found.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            attendant.is_on_shift = True
            attendant.save(update_fields=['is_on_shift'])
            # Process valet queue
            from parking.utils import process_valet_queue
            process_valet_queue(attendant)

        return Response({'id': attendant.id, 'is_on_shift': True})


class EndShiftView(APIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def post(self, request, pk):
        try:
            attendant = User.objects.get(pk=pk, role='attendant')
        except User.DoesNotExist:
            return Response({'error': 'Attendant not found.'}, status=status.HTTP_404_NOT_FOUND)
        attendant.is_on_shift = False
        attendant.save(update_fields=['is_on_shift'])
        return Response({'id': attendant.id, 'is_on_shift': False})


class OnShiftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        on_shift = User.objects.filter(
            role='attendant', is_active=True, is_on_shift=True
        ).annotate(
            active_tasks=Count(
                'assigned_tickets',
                filter=Q(assigned_tickets__status__in=['valet_assigned', 'parked', 'retrieval_pending'])
            ),
            today_tasks=Count(
                'assigned_tickets',
                filter=Q(assigned_tickets__entry_time__date=today)
            ),
        ).order_by('active_tasks')
        data = [
            {
                'id': a.id, 'username': a.username,
                'full_name': a.get_full_name() or a.username,
                'is_on_shift': a.is_on_shift,
                'active_tasks': a.active_tasks,
                'today_tasks': a.today_tasks,
                'last_assigned_at': a.last_assigned_at.isoformat() if a.last_assigned_at else None,
            }
            for a in on_shift
        ]
        from parking.models import ValetQueue
        return Response({
            'on_shift_count': len(data),
            'valet_queue_count': ValetQueue.objects.filter(status='waiting').count(),
            'attendants': data,
        })
