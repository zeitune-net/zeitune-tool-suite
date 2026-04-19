import type { ServiceConfig, ServiceScanResult, ServiceType } from '../../types'

export const typeLabels: Record<ServiceType, string> = {
  'spring-boot-maven': 'Spring Boot (Maven)',
  'spring-boot-gradle': 'Spring Boot (Gradle)',
  node: 'Node.js',
  python: 'Python',
  'docker-compose': 'Docker Compose',
  custom: 'Custom'
}

export const typeBadgeVariant: Record<
  ServiceType,
  'success' | 'info' | 'warning' | 'purple' | 'secondary' | 'muted'
> = {
  'spring-boot-maven': 'success',
  'spring-boot-gradle': 'success',
  node: 'info',
  python: 'warning',
  'docker-compose': 'purple',
  custom: 'muted'
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

export function scanResultToConfig(result: ServiceScanResult): ServiceConfig {
  return {
    id: generateId(),
    name: result.name,
    type: result.type,
    workingDir: result.workingDir,
    command: result.suggestedCommand,
    buildCommand: result.suggestedBuildCommand,
    port: result.suggestedPort,
    autoRestart: false
  }
}

export function newEmptyService(workingDir: string): ServiceConfig {
  return {
    id: generateId(),
    name: '',
    type: 'custom',
    workingDir,
    command: '',
    autoRestart: false
  }
}
