export interface DependencyCheck {
  status: string;
  latencyMs: number;
}

export interface HealthCheckResponse {
  status: string;
  uptime: number;
  checks: {
    redis: DependencyCheck;
    postgresql: DependencyCheck;
  };
}
