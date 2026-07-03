import { useEffect, useRef } from 'react';
import useAuthStore from '../store/authStore';
import { agentAPI } from '../services/api';

// BARCHA foydalanuvchilar uchun: telefon GPS joylashuvini serverga avtomatik yuboradi
// (agent, shopir va boshqalar — ega/savdo boshlig'i xaritada ko'radi).
// Kirganda darhol + har 5 daqiqada. Ruxsat berilmasa jimgina o'tadi (ilova ishlashda davom etadi).
const INTERVAL_MS = 5 * 60 * 1000;

export default function useAgentLocation() {
  const { user } = useAuthStore();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!user?.id || !navigator.geolocation) return;

    const send = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          agentAPI.sendLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }).catch(() => {});
        },
        () => {}, // ruxsat yo'q yoki GPS o'chiq — e'tiborsiz
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      );
    };

    send();
    timerRef.current = setInterval(send, INTERVAL_MS);
    return () => clearInterval(timerRef.current);
  }, [user?.id]);
}
