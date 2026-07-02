import type { GraphWorkflowConfig } from "@ai-di/graph-workflow";
import { Injectable } from "@nestjs/common";
import { RateVersionSeederService } from "./rate-version-seeder.service";

export interface WorkflowCostEstimation {
  estimatedUnits: number;
  rateVersionId: string;
  unitCostDollars: number;
}

@Injectable()
export class PreflightCostEstimatorService {
  constructor(
    private readonly rateVersionSeederService: RateVersionSeederService,
  ) {}

  /**
   * Estimates the worst-case cost of a workflow using longest-path DP
   * (critical path method) over the activity DAG. Topological order is computed
   * via Kahn's algorithm; at each fork, the most expensive branch is taken,
   * so the result is a conservative upper bound suitable for cap enforcement.
   *
   * @param config - The graph workflow configuration to estimate costs for.
   * @returns Estimated units, the active rate version ID, and the unit cost.
   */
  async estimateWorkflowCost(
    config: GraphWorkflowConfig,
  ): Promise<WorkflowCostEstimation> {
    const rateVersion =
      await this.rateVersionSeederService.getActiveRateVersion(new Date());

    if (!rateVersion) {
      return { estimatedUnits: 0, rateVersionId: "", unitCostDollars: 0 };
    }

    const costMap = new Map(
      rateVersion.activity_costs.map((ac) => [ac.activity_name, ac]),
    );
    const maxPagesAssumption = rateVersion.max_pages_assumption;

    const nodeIds = Object.keys(config.nodes);

    // Build predecessor map using normal and conditional edges
    const predecessors = new Map<string, string[]>();
    for (const nodeId of nodeIds) {
      predecessors.set(nodeId, []);
    }
    for (const edge of config.edges) {
      if (edge.type === "normal" || edge.type === "conditional") {
        const list = predecessors.get(edge.target);
        if (list) {
          list.push(edge.source);
        }
      }
    }

    // Compute topological order (Kahn's algorithm) using normal + conditional edges
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const nodeId of nodeIds) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, []);
    }
    for (const edge of config.edges) {
      if (edge.type === "normal" || edge.type === "conditional") {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
        const neighbors = adjacency.get(edge.source) ?? [];
        neighbors.push(edge.target);
        adjacency.set(edge.source, neighbors);
      }
    }

    const queue: string[] = [];
    for (const nodeId of nodeIds) {
      if ((inDegree.get(nodeId) ?? 0) === 0) {
        queue.push(nodeId);
      }
    }
    queue.sort();

    const topoOrder: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      topoOrder.push(nodeId);
      const neighbors = adjacency.get(nodeId) ?? [];
      for (const neighbor of [...neighbors].sort()) {
        const deg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) {
          queue.push(neighbor);
          queue.sort();
        }
      }
    }

    // Compute node-level unit cost
    const nodeCost = (nodeId: string): number => {
      const node = config.nodes[nodeId];
      if (!node) return 0;

      let activityType: string | undefined;
      if (node.type === "activity") {
        activityType = node.activityType;
      } else if (node.type === "pollUntil") {
        activityType = node.activityType;
      }

      if (!activityType) return 0;

      const costEntry = costMap.get(activityType);
      if (!costEntry) return 0;

      if (costEntry.cost_type === "flat") {
        return Number(costEntry.units);
      }
      if (costEntry.cost_type === "per_page") {
        return maxPagesAssumption * Number(costEntry.units);
      }
      return 0;
    };

    // Longest-path DP: dp[node] = max cost from any entry node to this node
    const dp = new Map<string, number>();
    for (const nodeId of topoOrder) {
      const preds = predecessors.get(nodeId) ?? [];
      const maxPredCost =
        preds.length === 0 ? 0 : Math.max(...preds.map((p) => dp.get(p) ?? 0));
      dp.set(nodeId, maxPredCost + nodeCost(nodeId));
    }

    const estimatedUnits =
      dp.size === 0 ? 0 : Math.max(...Array.from(dp.values()));

    return {
      estimatedUnits,
      rateVersionId: rateVersion.id,
      unitCostDollars: Number(rateVersion.unit_cost_dollars),
    };
  }
}
