import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  FieldType,
  PrismaClient,
  ProjectStatus,
} from "../../backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../backend-services/src/utils/database-url";

const prisma = new PrismaClient({
  adapter: new PrismaPg(getPrismaPgOptions(process.env.DATABASE_URL)),
});

const SDPR_TEMPLATE_PROJECT_ID = "seed-sdpr-monthly-report-template";
const SDPR_TEMPLATE_PROJECT_NAME = "SDPR monthly report template";
const SDPR_TEMPLATE_PROJECT_DESCRIPTION =
  "Seeded labeling project for SDPR monthly report template training.";
const SDPR_TEMPLATE_PROJECT_CREATED_BY = "seed";

type SeedFieldDefinition = {
  fieldKey: string;
  fieldType: FieldType;
  fieldFormat?: string;
};

const SDPR_MONTHLY_REPORT_FIELDS: SeedFieldDefinition[] = [
  { fieldKey: "checkbox_need_assistance_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_need_assistance_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_family_assets_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_family_assets_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_shelter_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_shelter_no", fieldType: FieldType.selectionMark },

  { fieldKey: "checkbox_dependants_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_dependants_no", fieldType: FieldType.selectionMark },

  {
    fieldKey: "checkbox_employment_changes_yes",
    fieldType: FieldType.selectionMark,
  },
  {
    fieldKey: "checkbox_employment_changes_no",
    fieldType: FieldType.selectionMark,
  },
  {
    fieldKey: "checkbox_employment_changes_spouse_yes",
    fieldType: FieldType.selectionMark,
  },
  {
    fieldKey: "checkbox_employment_changes_spouse_no",
    fieldType: FieldType.selectionMark,
  },

  { fieldKey: "checkbox_school_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_school_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_school_spouse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_school_spouse_no", fieldType: FieldType.selectionMark },

  { fieldKey: "checkbox_work_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_work_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_work_souse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_work_souse_no", fieldType: FieldType.selectionMark },

  { fieldKey: "checkbox_moved_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_moved_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_moved_spouse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_moved_spouse_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_no", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_spouse_yes", fieldType: FieldType.selectionMark },
  { fieldKey: "checkbox_warrant_spouse_no", fieldType: FieldType.selectionMark },
  { fieldKey: "explain_changes", fieldType: FieldType.string },
  { fieldKey: "signature", fieldType: FieldType.string },
  { fieldKey: "spouse_signature", fieldType: FieldType.string },
  { fieldKey: "date", fieldType: FieldType.date, fieldFormat: "dmy" },
  { fieldKey: "spouse_date", fieldType: FieldType.date, fieldFormat: "dmy" },
  { fieldKey: "name", fieldType: FieldType.string },
  { fieldKey: "spouse_name", fieldType: FieldType.string },
  { fieldKey: "phone", fieldType: FieldType.string },
  { fieldKey: "spouse_phone", fieldType: FieldType.string },
  { fieldKey: "sin", fieldType: FieldType.string },
  { fieldKey: "spouse_sin", fieldType: FieldType.string },
  { fieldKey: "applicant_net_employment_income", fieldType: FieldType.number },
  { fieldKey: "applicant_employment_insurance", fieldType: FieldType.number },
  {
    fieldKey: "applicant_spousal_support_alimony",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_child_support", fieldType: FieldType.number },
  { fieldKey: "applicant_workbc_financial_support", fieldType: FieldType.number },
  {
    fieldKey: "applicant_student_funding_loans_bursaries",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_rental_income", fieldType: FieldType.number },
  { fieldKey: "applicant_room_board_income", fieldType: FieldType.number },
  { fieldKey: "applicant_workers_compensation", fieldType: FieldType.number },
  {
    fieldKey: "applicant_private_pensions_retirement_disability",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_oas_gis", fieldType: FieldType.number },
  { fieldKey: "applicant_trust_income", fieldType: FieldType.number },
  {
    fieldKey: "applicant_canada_pension_plan_cpp",
    fieldType: FieldType.number,
  },
  { fieldKey: "applicant_tax_credits_gst_credit", fieldType: FieldType.number },
  { fieldKey: "applicant_child_tax_benefits", fieldType: FieldType.number },
  { fieldKey: "applicant_income_tax_refund", fieldType: FieldType.number },
  {
    fieldKey: "applicant_other_income_money_received",
    fieldType: FieldType.number,
  },
  {
    fieldKey: "applicant_income_of_dependent_children",
    fieldType: FieldType.number,
  },
  { fieldKey: "spouse_net_employment_income", fieldType: FieldType.number },
  { fieldKey: "spouse_employment_insurance", fieldType: FieldType.number },
  { fieldKey: "spouse_spousal_support_alimony", fieldType: FieldType.number },
  { fieldKey: "spouse_child_support", fieldType: FieldType.number },
  { fieldKey: "spouse_workbc_financial_support", fieldType: FieldType.number },
  {
    fieldKey: "spouse_student_funding_loans_bursaries",
    fieldType: FieldType.number,
  },
  { fieldKey: "spouse_rental_income", fieldType: FieldType.number },
  { fieldKey: "spouse_room_board_income", fieldType: FieldType.number },
  { fieldKey: "spouse_workers_compensation", fieldType: FieldType.number },
  {
    fieldKey: "spouse_private_pensions_retirement_disability",
    fieldType: FieldType.number,
  },
  { fieldKey: "spouse_oas_gis", fieldType: FieldType.number },
  { fieldKey: "spouse_trust_income", fieldType: FieldType.number },
  { fieldKey: "spouse_canada_pension_plan_cpp", fieldType: FieldType.number },
  { fieldKey: "spouse_tax_credits_gst_credit", fieldType: FieldType.number },
  { fieldKey: "spouse_child_tax_benefits", fieldType: FieldType.number },
  { fieldKey: "spouse_income_tax_refund", fieldType: FieldType.number },
  { fieldKey: "spouse_other_income_money_received", fieldType: FieldType.number },
  { fieldKey: "spouse_income_of_dependent_children", fieldType: FieldType.number },
];

async function main() {
  const project = await prisma.labelingProject.upsert({
    where: { id: SDPR_TEMPLATE_PROJECT_ID },
    update: {
      name: SDPR_TEMPLATE_PROJECT_NAME,
      description: SDPR_TEMPLATE_PROJECT_DESCRIPTION,
      created_by: SDPR_TEMPLATE_PROJECT_CREATED_BY,
      status: ProjectStatus.active,
    },
    create: {
      id: SDPR_TEMPLATE_PROJECT_ID,
      name: SDPR_TEMPLATE_PROJECT_NAME,
      description: SDPR_TEMPLATE_PROJECT_DESCRIPTION,
      created_by: SDPR_TEMPLATE_PROJECT_CREATED_BY,
      status: ProjectStatus.active,
    },
  });

  const fieldKeys = SDPR_MONTHLY_REPORT_FIELDS.map((field) => field.fieldKey);

  await prisma.fieldDefinition.deleteMany({
    where: {
      project_id: project.id,
      field_key: {
        notIn: fieldKeys,
      },
    },
  });

  await prisma.$transaction(
    SDPR_MONTHLY_REPORT_FIELDS.map((field, index) =>
      prisma.fieldDefinition.upsert({
        where: {
          project_id_field_key: {
            project_id: project.id,
            field_key: field.fieldKey,
          },
        },
        update: {
          field_type: field.fieldType,
          field_format: field.fieldFormat ?? null,
          display_order: index,
        },
        create: {
          project_id: project.id,
          field_key: field.fieldKey,
          field_type: field.fieldType,
          field_format: field.fieldFormat ?? null,
          display_order: index,
        },
      }),
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
