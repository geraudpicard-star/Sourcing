import type { Company } from "@/types/company";

const HEADERS = [
  "siren",
  "siret",
  "denomination",
  "naf_code",
  "creation_date",
  "age_years",
  "employee_range",
  "active",
  "street",
  "postal_code",
  "city",
  "department",
  "source",
  "fetched_at",
] as const;

export function companiesToCsv(companies: Company[]): string {
  const lines: string[] = [HEADERS.join(",")];
  for (const c of companies) {
    lines.push(
      [
        c.siren,
        c.siret ?? "",
        c.denomination,
        c.nafCode ?? "",
        c.creationDate ?? "",
        c.ageYears ?? "",
        c.employeeRange ?? "",
        c.active ? "true" : "false",
        c.address.street ?? "",
        c.address.postalCode ?? "",
        c.address.city ?? "",
        c.address.department ?? "",
        c.source,
        c.fetchedAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM so Excel detects UTF-8.
  return "﻿" + lines.join("\r\n");
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
