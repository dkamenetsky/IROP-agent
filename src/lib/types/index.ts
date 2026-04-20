export type DisruptionType = string;
export type StaffRole = 'Gate' | 'Ramp' | 'Customer Service' | 'Operations';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RecoveryMode = 'anthropic-agent' | 'openrouter-agent' | 'fallback-planner';

export interface Flight {
  id: string;
  flightNumber: string;
  route: string;
  gate: string;
  scheduledDeparture: string;
  passengers: number;
  rolesNeeded: Partial<Record<StaffRole, number>>;
}

export interface Disruption {
  id: string;
  flightNumber: string;
  type: DisruptionType;
  minutesDelayed?: number;
  newGate?: string;
  reason: string;
  severity: RiskLevel;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  certifications: string[];
  shiftStart: string;
  shiftEnd: string;
  hoursThisWeek: number;
  maxHours: number;
  onReserve: boolean;
  assignedFlights: string[];
}

export interface ToolStep {
  tool: string;
  input: Record<string, unknown>;
  outputSummary: string;
  status?: 'success' | 'error' | 'info';
}

export interface RecoveryAction {
  title: string;
  owner: string;
  reason: string;
  impact: string;
}

export interface PassengerRecoveryAction {
  title: string;
  owner: string;
  reason: string;
}

export interface EscalationStep {
  phase: string;
  trigger: string;
  action: string;
  owner: string;
}

export interface StaffingOption {
  role: StaffRole;
  required: number;
  status: 'ready' | 'watch' | 'gap';
  recommendedStaff: string | null;
  scheduledCount?: number;
  reserveAvailable?: number;
  shortfall?: number;
  backups: string[];
  reason: string;
  excludedCandidates: string[];
}

export interface DisruptionTypeDefinition {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  severity: RiskLevel;
  staffingRisk: RiskLevel;
  operationalFocus: string;
  passengerImpact: string;
  defaultImpactMinutes: number;
  actionRules: RecoveryAction[];
  passengerActions: PassengerRecoveryAction[];
  escalationTimeline: EscalationStep[];
  alternatives: string[];
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  flightNumber: string;
  disruptionTypeId: string;
  notes: string;
  message: string;
}

export interface RuntimeConfig {
  version: number;
  disruptionTypes: DisruptionTypeDefinition[];
  scenarios: ScenarioDefinition[];
}

export interface AnalyzeInput {
  flightNumber?: string;
  disruptionTypeId?: string;
  notes?: string;
  message?: string;
}

export interface IncidentContext {
  input: AnalyzeInput;
  observedFlight: Record<string, unknown> | null;
  observedDisruption: Record<string, unknown> | null;
  observedStaffing: Record<string, unknown> | null;
  observedPassengerRecovery: Record<string, unknown> | null;
  actionLog: Array<Record<string, unknown>>;
}

export interface RecoveryPlan {
  summary: string;
  disruptedFlight: string;
  disruptionType: DisruptionType;
  impactedWindow: string;
  staffingRisk: RiskLevel;
  passengerImpact: string;
  operationalFocus: string;
  recommendedNextAction: RecoveryAction;
  actions: RecoveryAction[];
  timeline: EscalationStep[];
  staffingOptions: StaffingOption[];
  passengerActions: PassengerRecoveryAction[];
  alternatives: string[];
  steps: ToolStep[];
  mode: RecoveryMode;
  incidentContext?: IncidentContext;
  durationMs?: number;
}
