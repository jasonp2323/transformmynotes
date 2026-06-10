'use client';

import React, { createContext, useContext } from 'react';

interface AdminShellContextValue {
  userName: string;
  isAdmin: boolean;
  userSub: string;
}

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export interface AdminShellProviderProps {
  userName: string;
  isAdmin: boolean;
  userSub: string;
  children: React.ReactNode;
}

/** Provides admin identity (userName, isAdmin, userSub) to the subtree. */
export function AdminShellProvider({
  userName,
  isAdmin,
  userSub,
  children,
}: AdminShellProviderProps) {
  return (
    <AdminShellContext.Provider value={{ userName, isAdmin, userSub }}>
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
