import { state } from '@/lib/state';
import { json } from './respond';
import type { ExactRoutes } from './types';

export const schedulingPost: ExactRoutes = {
  'api/scheduling/getavailableappointments': ({ ds }) => json({ appointments: ds.availableAppointments }),

  'api/scheduling/bookappointment': async ({ request, ds }) => {
    try {
      const body = await request.json();
      const slotId = body.slotId;
      // Find the slot across all providers
      let foundSlot: { date: string; time: string; slotId: string } | null = null;
      let foundProvider: typeof ds.availableAppointments[0] | null = null;
      for (const appt of ds.availableAppointments) {
        const slot = appt.slots.find(s => s.slotId === slotId);
        if (slot) { foundSlot = slot; foundProvider = appt; break; }
      }
      if (!foundSlot || !foundProvider) {
        return json({ success: false, error: 'Slot not found' }, 400);
      }
      const confirmation = {
        confirmationNumber: `SPRFLD-${Date.now().toString(36).toUpperCase()}`,
        slotId,
        provider: foundProvider.provider,
        department: foundProvider.department,
        location: foundProvider.location,
        visitType: foundProvider.visitType,
        date: foundSlot.date,
        time: foundSlot.time,
        reason: body.reason || 'Not specified',
      };
      state.bookedAppointments.push(confirmation);
      return json({
        success: true,
        ...confirmation,
        message: `Your appointment with ${foundProvider.provider} on ${foundSlot.date} at ${foundSlot.time} has been confirmed.`,
      });
    } catch {
      return json({ success: false, error: 'Invalid request' }, 400);
    }
  },
};
