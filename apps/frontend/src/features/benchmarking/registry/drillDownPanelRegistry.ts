/**
 * Drill-down panel component registry
 *
 * Allows workflow-specific visualization panels to be registered
 * without modifying the core drill-down framework.
 */
export interface DrillDownPanelProps {
  sampleId: string;
  metadata: Record<string, unknown>;
  metrics: Record<string, number>;
  groundTruth?: unknown;
  prediction?: unknown;
  evaluationDetails?: unknown;
  diagnostics?: Record<string, unknown>;
}

export type DrillDownPanelComponent = React.FC<DrillDownPanelProps>;

class DrillDownPanelRegistry {
  private panels: Map<string, DrillDownPanelComponent> = new Map();

  register(name: string, component: DrillDownPanelComponent) {
    this.panels.set(name, component);
  }

  get(name: string): DrillDownPanelComponent | undefined {
    return this.panels.get(name);
  }

  getAll(): Array<{ name: string; component: DrillDownPanelComponent }> {
    return Array.from(this.panels.entries()).map(([name, component]) => ({
      name,
      component,
    }));
  }
}

export const drillDownPanelRegistry = new DrillDownPanelRegistry();
