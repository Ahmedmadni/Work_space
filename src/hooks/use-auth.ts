import { useCallback, useEffect, useState } from "react";

import { isSupabaseBackend } from "@/lib/backend-config";
import {
  getValidRemoteSession,
  signOutRemote,
  type RemoteAuthSession,
} from "@/services/auth.service";
import { CURRENT_USER } from "@/services/local-db";
import type { Profile } from "@/types";

function profileFromSession(session: RemoteAuthSession): Profile {
  const name = session.user.full_name || session.user.email || "مستخدم";
  return {
    id: session.user.id,
    full_name: name,
    email: session.user.email ?? "",
    initials: name.trim().slice(0, 1) || "م",
  };
}

export function useCurrentUser() {
  const [user, setUser] = useState<Profile | null>(
    isSupabaseBackend() ? null : CURRENT_USER,
  );
  const [loading, setLoading] = useState(isSupabaseBackend());

  const refresh = useCallback(async () => {
    if (!isSupabaseBackend()) {
      setUser(CURRENT_USER);
      setLoading(false);
      return CURRENT_USER;
    }
    setLoading(true);
    const session = await getValidRemoteSession();
    const profile = session ? profileFromSession(session) : null;
    setUser(profile);
    setLoading(false);
    return profile;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await signOutRemote();
    setUser(null);
  }, []);

  return { user, loading, refresh, signOut };
}
