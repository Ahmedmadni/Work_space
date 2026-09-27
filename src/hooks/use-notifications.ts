import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  countUnreadNotifications,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications.service";
import type { NotificationFilter } from "@/types/notifications";

export function useNotifications(
  filter: NotificationFilter = "all",
  enabled = true,
) {
  return useQuery({
    queryKey: ["notifications", filter],
    queryFn: () => listUserNotifications(filter, 80),
    enabled,
    refetchInterval: enabled ? 8_000 : false,
  });
}

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: countUnreadNotifications,
    enabled,
    refetchInterval: enabled ? 8_000 : false,
  });
}

function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidateNotifications();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
  });
}
