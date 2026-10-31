from django.db import migrations


def backfill_vip_zone_slots(apps, schema_editor):
    ParkingSlot = apps.get_model('parking', 'ParkingSlot')
    ParkingSlot.objects.filter(zone='VIP', slot_category__iexact='standard').update(slot_category='vip')


class Migration(migrations.Migration):
    dependencies = [
        ('parking', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(backfill_vip_zone_slots, migrations.RunPython.noop),
    ]
