import { createContext, useContext } from "react";

export interface Church {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  parent_church_id: string | null;
  is_matriz: boolean;
  organization_type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  pastor_name: string | null;
}

export interface ChurchContextType {
  church: Church | null;
  activeChurch: Church | null;
  activeChurchId: string | null;
  profileChurchId: string | null;
  churches: Church[];
  loading: boolean;
  isMatriz: boolean;
  congregations: Church[];
  switchChurch: (churchId: string) => boolean;
  clearActiveChurch: () => void;
  refetch: () => void;
}

export const ChurchContext = createContext<ChurchContextType>({
  church: null,
  activeChurch: null,
  activeChurchId: null,
  profileChurchId: null,
  churches: [],
  loading: true,
  isMatriz: false,
  congregations: [],
  switchChurch: () => false,
  clearActiveChurch: () => {},
  refetch: () => {},
});

export const useChurch = () => useContext(ChurchContext);
