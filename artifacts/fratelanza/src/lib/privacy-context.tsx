import React, { createContext, useContext, useState, ReactNode } from 'react';

type PrivacyContextType = {
  isPrivate: boolean;
  togglePrivacy: () => void;
  enablePrivacy: () => void;
  disablePrivacy: (password: string) => boolean;
  setPrivacyPassword: (oldPwd: string | null, newPwd: string) => boolean;
  hasPassword: boolean;
};

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);
const STORAGE_KEY = 'fratelanza.privacy.pwd';
const DEFAULT_PWD = 'fratelanza';

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_PWD;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_PWD;
  });

  const enablePrivacy = () => setIsPrivate(true);

  const disablePrivacy = (pwd: string) => {
    if (pwd === password) {
      setIsPrivate(false);
      return true;
    }
    return false;
  };

  // Legacy toggle: enables freely, but disabling now requires the password via disablePrivacy.
  const togglePrivacy = () => {
    if (!isPrivate) setIsPrivate(true);
  };

  const setPrivacyPassword = (oldPwd: string | null, newPwd: string) => {
    if (oldPwd !== null && oldPwd !== password) return false;
    if (!newPwd) return false;
    setPassword(newPwd);
    try { localStorage.setItem(STORAGE_KEY, newPwd); } catch {}
    return true;
  };

  return (
    <PrivacyContext.Provider value={{ isPrivate, togglePrivacy, enablePrivacy, disablePrivacy, setPrivacyPassword, hasPassword: true }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
}
