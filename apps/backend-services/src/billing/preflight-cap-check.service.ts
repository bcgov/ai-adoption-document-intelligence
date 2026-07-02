import { Prisma } from "@generated/client";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

/**
 * Response body returned with HTTP 402 when a group would exceed their monthly cap.
 */
export interface CapExceededResponse {
  message: string;
  shortfall_dollars: number;
  current_spend_dollars: number;
  monthly_cap_dollars: number;
  estimated_cost_dollars: number;
}

@Injectable()
export class PreflightCapCheckService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Checks whether a workflow submission would exceed the group's monthly spending cap.
   *
   * Runs inside a serializable transaction with a row-level lock on the
   * UsagePeriodSummary row to prevent concurrent requests from both passing
   * a cap check when only one should.
   *
   * @param groupId - The group whose cap to check.
   * @param estimatedUnits - Estimated units from the pre-flight cost estimator.
   * @param unitCostDollars - Dollar cost per unit from the active rate version.
   * @throws {HttpException} HTTP 402 if the estimated cost would exceed the monthly cap.
   */
  async checkCap(
    groupId: string,
    estimatedUnits: number,
    unitCostDollars: number,
  ): Promise<void> {
    const estimatedCostDollars = estimatedUnits * unitCostDollars;

    await this.prismaService.prisma.$transaction(
      async (tx) => {
        const config = await tx.groupBillingConfig.findUnique({
          where: { group_id: groupId },
        });

        if (!config || config.monthly_cap_dollars === null) {
          return;
        }

        const cap = Number(config.monthly_cap_dollars);

        const now = new Date();
        const year = now.getUTCFullYear();
        const month = now.getUTCMonth() + 1;

        // Row-level lock to prevent concurrent double-passing
        const rows = await tx.$queryRaw<
          { total_dollars_spent: Prisma.Decimal }[]
        >`
          SELECT total_dollars_spent
          FROM "UsagePeriodSummary"
          WHERE group_id = ${groupId}
            AND period_year = ${year}
            AND period_month = ${month}
          FOR UPDATE
        `;

        const currentSpend =
          rows.length > 0 ? Number(rows[0].total_dollars_spent) : 0;

        if (currentSpend + estimatedCostDollars > cap) {
          const shortfall = currentSpend + estimatedCostDollars - cap;
          const body: CapExceededResponse = {
            message: "Monthly spending cap exceeded",
            shortfall_dollars: shortfall,
            current_spend_dollars: currentSpend,
            monthly_cap_dollars: cap,
            estimated_cost_dollars: estimatedCostDollars,
          };
          throw new HttpException(body, HttpStatus.PAYMENT_REQUIRED);
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
