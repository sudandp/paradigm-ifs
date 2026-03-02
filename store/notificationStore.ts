import { create } from 'zustand';
import { api } from '../services/api';
import type { Notification } from '../types';
import { useAuthStore } from './authStore';
import { supabase } from '../services/supabase';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  isPanelOpen: boolean;
  setIsPanelOpen: (isOpen: boolean) => void;
  togglePanel: () => void;
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  acknowledgeNotification: (notificationId: string) => Promise<void>;
  subscribeToNotifications: () => () => void;
  updateBadgeCount: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  isPanelOpen: false,

  setIsPanelOpen: (isOpen: boolean) => set({ isPanelOpen: isOpen }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true, error: null });
    try {
      const notifications = await api.getNotifications(user.id);
      const unreadCount = notifications.filter(n => !n.isRead).length;
      set({ notifications, unreadCount, isLoading: false });
      get().updateBadgeCount();
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      set({ error: 'Failed to fetch notifications.', isLoading: false });
    }
  },

  markAsRead: async (notificationId: string) => {
    const existing = get().notifications.find(n => n.id === notificationId);
    if (existing && existing.isRead) return;

    try {
      await api.markNotificationAsRead(notificationId);
      set((state) => ({
        notifications: state.notifications.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
      get().updateBadgeCount();
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  },

  markAllAsRead: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    if (get().unreadCount === 0) return;

    try {
      await api.markAllNotificationsAsRead(user.id);
      set((state) => ({
        notifications: state.notifications.map(n => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
      get().updateBadgeCount();
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  },
  
  acknowledgeNotification: async (notificationId: string) => {
    try {
      await api.acknowledgeNotification(notificationId);
      set((state) => ({
        notifications: state.notifications.map(n =>
          n.id === notificationId ? { ...n, acknowledgedAt: new Date().toISOString(), isRead: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - (state.notifications.find(n => n.id === notificationId)?.isRead ? 0 : 1)),
      }));
      get().updateBadgeCount();
    } catch (err) {
      console.error("Failed to acknowledge notification:", err);
    }
  },

  updateBadgeCount: async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const count = get().unreadCount;
      // Use a variable to bypass Vite's static import analysis which causes 500 errors if the plugin is missing from node_modules
      const pluginPath = '@capawesome/capacitor-badge';
      // @ts-ignore
      const { Badge } = await import(/* @vite-ignore */ pluginPath).catch(() => ({ Badge: null }));
      if (Badge && typeof Badge.set === 'function') {
        await Badge.set({ count });
      }
    } catch (err) {
      console.warn('Badge plugin notification failed:', err);
    }
  },

  subscribeToNotifications: () => {
    const user = useAuthStore.getState().user;
    if (!user) return () => {};

    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const newNotif = api.toCamelCase(payload.new) as Notification;
          
          set((state) => ({
            notifications: [newNotif, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          }));

          if (Capacitor.isNativePlatform()) {
            try {
              await LocalNotifications.schedule({
                notifications: [
                  {
                    title: newNotif.title || 'New Notification',
                    body: newNotif.message,
                    id: Math.floor(Math.random() * 10000),
                    extra: { link: newNotif.linkTo },
                    sound: 'beep.wav'
                  }
                ]
              });
              get().updateBadgeCount();
            } catch (err) {
              console.error('Failed to schedule local notification:', err);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));