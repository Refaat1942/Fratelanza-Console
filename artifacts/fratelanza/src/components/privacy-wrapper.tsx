import React from 'react';
import { usePrivacy } from '@/lib/privacy-context';

export function PrivacyWrapper({ value, format = 'currency' }: { value: number | string, format?: 'currency' | 'number' | 'text' }) {
  const { isPrivate } = usePrivacy();

  if (isPrivate) {
    return <span>***</span>;
  }

  if (format === 'currency' && typeof value === 'number') {
    return <span>${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }

  if (format === 'number' && typeof value === 'number') {
    return <span>{value.toLocaleString()}</span>;
  }

  return <span>{value}</span>;
}
