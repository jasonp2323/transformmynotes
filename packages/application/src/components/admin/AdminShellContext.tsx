'use client';

import React, { createContext, useContext } from 'react';

interface AdminShellContextValue {
  userName: string;
  isAdmin: boolean;
  userSub: string;
  pendingCount?: number;
}

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export interface AdminShellProviderProps {
  userName: string;
  isAdmin: boolean;
  userSub: string;
  pendingCount?: number;
  children: React.ReactNode;
}

/** Provides admin identity (userName, isAdmin, userSub, pendingCount) to the subtree. */
export function AdminShellProvider({
  userName,
  isAdmin,
  userSub,
  pendingCount,
  children,
}: AdminShellProviderProps) {
  return (
    <AdminShellContext.Provider value={{ userName, isAdmin, userSub, pendingCount }}>
      {children}
    </AdminShellContext.Provider>
  );
}

/** Hook to consume AdminShellContext. Throws if used outside the provider. */
export function useAdminShell(): AdminShellContextValue {
  const ctx = useContext(AdminShellContext);
  if (ctx === null) {
    throw new Error(
      'useAdminShell must be used within an <AdminShellProvider>.',
    );
  }
  return ctx;
}
