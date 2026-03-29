import { create } from 'zustand'

export type ServiceStatus = 'running' | 'stopped' | 'building' | 'error'

export interface Service {
  name: string
  port: number
  status: ServiceStatus
  description: string
  type: 'service' | 'infrastructure'
}

interface DevManagerStore {
  services: Service[]
  selectedService: string | null
  setSelectedService: (name: string) => void
}

export const useDevManagerStore = create<DevManagerStore>()((set) => ({
  services: [],
  selectedService: null,
  setSelectedService: (name) => set({ selectedService: name })
}))
