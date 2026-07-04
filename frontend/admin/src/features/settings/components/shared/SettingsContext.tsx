"use client";

import React, { createContext, useContext } from 'react';
import { type Tenant } from '@xfos/contracts-tenant';

interface SettingsContextType {
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  data: Tenant | null;
  isLoading: boolean;
  updateLocalData: (updates: Partial<Tenant>) => void;
}

export const SettingsContext = createContext<SettingsContextType>({ 
  isEditing: false,
  setIsEditing: () => {},
  data: null,
  isLoading: true,
  updateLocalData: () => {},
});

export const useSettingsContext = () => useContext(SettingsContext);
