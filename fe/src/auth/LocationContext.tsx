import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { Province } from '../types';

const STORAGE_KEY = 'ticket_booking_province_code';
const DEFAULT_PROVINCE_CODE = 79;

type LocationContextValue = {
  provinces: Province[];
  selectedProvinceCode: number;
  settledProvinceCode: number;
  selectedProvince: Province | null;
  setSelectedProvinceCode: (code: number) => void;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

function storedProvinceCode() {
  const value = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PROVINCE_CODE;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedProvinceCode, setSelectedProvinceCodeState] = useState(storedProvinceCode);
  const [settledProvinceCode, setSettledProvinceCode] = useState(storedProvinceCode);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['provinces'],
    queryFn: ({ signal }) => api.provinces(signal),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const provinces = useMemo(() => data ?? [], [data]);
  const validCode = !provinces.length
    ? selectedProvinceCode
    : provinces.some((province) => province.code === selectedProvinceCode)
      ? selectedProvinceCode
      : DEFAULT_PROVINCE_CODE;
  const selectedProvince = useMemo(() => provinces.find((province) => province.code === validCode) ?? null, [provinces, validCode]);

  useEffect(() => {
    if (validCode !== selectedProvinceCode) setSelectedProvinceCodeState(validCode);
    localStorage.setItem(STORAGE_KEY, String(validCode));
  }, [selectedProvinceCode, validCode]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledProvinceCode(validCode), 120);
    return () => window.clearTimeout(timer);
  }, [validCode]);

  const setSelectedProvinceCode = useCallback((code: number) => {
    if (!provinces.length || provinces.some((province) => province.code === code)) {
      setSelectedProvinceCodeState(code);
      localStorage.setItem(STORAGE_KEY, String(code));
    }
  }, [provinces]);
  const retryProvinces = useCallback(() => { void refetch(); }, [refetch]);

  const value = useMemo<LocationContextValue>(() => ({
    provinces,
    selectedProvinceCode: validCode,
    settledProvinceCode,
    selectedProvince,
    setSelectedProvinceCode,
    isPending,
    isError,
    refetch: retryProvinces,
  }), [isError, isPending, provinces, retryProvinces, selectedProvince, setSelectedProvinceCode, settledProvinceCode, validCode]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext() {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocationContext must be used inside LocationProvider');
  return context;
}
