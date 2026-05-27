-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GP', 'LP', 'VIEWER');

-- CreateEnum
CREATE TYPE "OaStatus" AS ENUM ('NOT_GENERATED', 'GENERATED', 'SENT_FOR_SIGNATURE', 'SIGNED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'GENERATED', 'SENT', 'SIGNED', 'PAID');

-- CreateTable
CREATE TABLE "firms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_firm_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GP',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_firm_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "property_address" TEXT,
    "property_state" TEXT,
    "asset_class" TEXT,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "cap_table_locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_offerings" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_banking" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_banking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spv_formations" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "entity_name" TEXT,
    "registered_agent" JSONB,
    "cert_of_formation" JSONB,
    "ein_obtained" BOOLEAN NOT NULL DEFAULT false,
    "foreign_qualification" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spv_formations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_agreements" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "status" "OaStatus" NOT NULL DEFAULT 'NOT_GENERATED',
    "document_key" TEXT,
    "generated_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accreditation" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "signed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "document_key" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blue_sky_filings" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blue_sky_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_feed_entries" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT,
    "firm_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_feed_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_properties" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_class" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounting_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_entries" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "pnl" JSONB NOT NULL,
    "below_line" JSONB NOT NULL,
    "working_capital" JSONB NOT NULL,
    "distributions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economics_deals" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "capital_stack" JSONB NOT NULL,
    "profit_split" JSONB NOT NULL,
    "fees" JSONB NOT NULL,
    "section_a_complete" BOOLEAN NOT NULL DEFAULT false,
    "section_b_complete" BOOLEAN NOT NULL DEFAULT false,
    "section_c_complete" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "economics_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economics_audit_entries" (
    "id" TEXT NOT NULL,
    "economics_deal_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "economics_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firm_templates" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "firm_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_entities" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "compliance_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_notifications" (
    "id" TEXT NOT NULL,
    "compliance_entity_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "investor_id" TEXT,
    "storage_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_firm_memberships_user_id_firm_id_key" ON "user_firm_memberships"("user_id", "firm_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_offerings_deal_id_key" ON "deal_offerings"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "deal_banking_deal_id_key" ON "deal_banking"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "spv_formations_deal_id_key" ON "spv_formations"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "operating_agreements_deal_id_key" ON "operating_agreements"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "blue_sky_filings_deal_id_state_code_key" ON "blue_sky_filings"("deal_id", "state_code");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_entries_property_id_period_key" ON "monthly_entries"("property_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "economics_deals_deal_id_key" ON "economics_deals"("deal_id");

-- AddForeignKey
ALTER TABLE "user_firm_memberships" ADD CONSTRAINT "user_firm_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_firm_memberships" ADD CONSTRAINT "user_firm_memberships_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_offerings" ADD CONSTRAINT "deal_offerings_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_banking" ADD CONSTRAINT "deal_banking_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spv_formations" ADD CONSTRAINT "spv_formations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operating_agreements" ADD CONSTRAINT "operating_agreements_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investors" ADD CONSTRAINT "investors_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blue_sky_filings" ADD CONSTRAINT "blue_sky_filings_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_feed_entries" ADD CONSTRAINT "activity_feed_entries_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_entries" ADD CONSTRAINT "monthly_entries_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "accounting_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economics_deals" ADD CONSTRAINT "economics_deals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "economics_audit_entries" ADD CONSTRAINT "economics_audit_entries_economics_deal_id_fkey" FOREIGN KEY ("economics_deal_id") REFERENCES "economics_deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firm_templates" ADD CONSTRAINT "firm_templates_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_entities" ADD CONSTRAINT "compliance_entities_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_notifications" ADD CONSTRAINT "compliance_notifications_compliance_entity_id_fkey" FOREIGN KEY ("compliance_entity_id") REFERENCES "compliance_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
