/**
 * Catalogue fixture — GENERATED from the live `services` + `line_item_rules`
 * tables, which are seeded by supabase/migrations/20260717120900_seed_catalogue.sql.
 *
 * This exists so the golden totals test is a pure unit test: it pins the ENGINE's
 * arithmetic without needing a database. If the real catalogue changes, this
 * fixture must be regenerated — and the pinned totals in totals.test.ts must be
 * re-confirmed against Kalari's written rate card, not just updated to match.
 *
 * ⚠️ EVERY RATE IS AN UNCONFIRMED PLACEHOLDER. See the seed migration header.
 */
import type { Service, Rule } from "../engine";

export const SERVICES: Service[] = [
  {
    id: "3bb1aef4-b9fe-4c41-b562-2f13ad692e1e",
    name: "Air Ticketing \u00b7 Domestic",
    family: "ticketing",
    category: null,
    location: "domestic",
    type: null
  },
  {
    id: "f407603c-e648-4a5a-bb3a-27349a09cd37",
    name: "Air Ticketing \u00b7 International",
    family: "ticketing",
    category: null,
    location: "international",
    type: null
  },
  {
    id: "7a7b64a6-6b13-4d72-9785-341c8c8cb111",
    name: "Haj Package",
    family: "haj_umrah",
    category: "haj",
    location: null,
    type: null
  },
  {
    id: "c892373a-7a82-44ec-afb0-4843eeeb65a3",
    name: "Holiday Package \u00b7 Domestic",
    family: "holiday",
    category: null,
    location: "domestic",
    type: null
  },
  {
    id: "b22bc649-1cd4-496e-a184-d1f7429dfedb",
    name: "Holiday Package \u00b7 International",
    family: "holiday",
    category: null,
    location: "international",
    type: null
  },
  {
    id: "2911a39a-60df-4272-bb71-a93fa51d73cc",
    name: "Hotel Reservation",
    family: "hotel",
    category: null,
    location: null,
    type: null
  },
  {
    id: "e2b4e47b-b2da-4d62-9701-112a0cda5bfb",
    name: "Passport Service \u00b7 New",
    family: "passport",
    category: null,
    location: null,
    type: "new"
  },
  {
    id: "d43167e5-5198-455e-9088-8808de572fc8",
    name: "Passport Service \u00b7 Renewal",
    family: "passport",
    category: null,
    location: null,
    type: "renew"
  },
  {
    id: "733e6ceb-303a-43c7-a0df-14cacf27a80a",
    name: "Umrah Package",
    family: "haj_umrah",
    category: "umrah",
    location: null,
    type: null
  },
  {
    id: "0f8e3841-6e7d-453e-853b-4a7076826ef0",
    name: "Visa Service \u00b7 New",
    family: "visa",
    category: null,
    location: null,
    type: "new"
  },
  {
    id: "2223aedd-a1bb-4337-8da2-a2ce8bd16c6f",
    name: "Visa Service \u00b7 Renewal",
    family: "visa",
    category: null,
    location: null,
    type: "renew"
  }
];

export const RULES: Rule[] = [
  {
    id: "0b3ba989-6f9b-47ca-89bf-af0c2a9be031",
    service_id: "0f8e3841-6e7d-453e-853b-4a7076826ef0",
    label: "Visa Processing Fee",
    rate_paise: 200000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "cf87a547-0403-42f8-aab4-02a6db4c2262",
    service_id: "0f8e3841-6e7d-453e-853b-4a7076826ef0",
    label: "Service Charge",
    rate_paise: 100000,
    qty_rule: "per_person",
    sort_order: 2
  },
  {
    id: "b7cce1cf-8228-4bc8-8ef2-d65a8cbb8fb1",
    service_id: "2223aedd-a1bb-4337-8da2-a2ce8bd16c6f",
    label: "Visa Renewal Processing",
    rate_paise: 150000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "0eaaa4f2-205a-46a2-b85f-f7768e8d7d4b",
    service_id: "2223aedd-a1bb-4337-8da2-a2ce8bd16c6f",
    label: "Service Charge",
    rate_paise: 100000,
    qty_rule: "per_person",
    sort_order: 2
  },
  {
    id: "b0d898ac-82e5-4ad3-8cdb-71e438348c54",
    service_id: "2911a39a-60df-4272-bb71-a93fa51d73cc",
    label: "Hotel Booking Fee",
    rate_paise: 50000,
    qty_rule: "once",
    sort_order: 1
  },
  {
    id: "9c53de82-ed66-4684-8997-fe3e250622fa",
    service_id: "3bb1aef4-b9fe-4c41-b562-2f13ad692e1e",
    label: "Ticketing Service Charge",
    rate_paise: 50000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "1a388b03-da22-4af2-8c4b-86a7484ee238",
    service_id: "733e6ceb-303a-43c7-a0df-14cacf27a80a",
    label: "Umrah Processing Fee",
    rate_paise: 300000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "a742414a-856d-4519-a6ca-96a228a6676e",
    service_id: "7a7b64a6-6b13-4d72-9785-341c8c8cb111",
    label: "Haj Processing Fee",
    rate_paise: 500000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "1daa950c-a4e2-4513-af29-6a7dd6bee010",
    service_id: "b22bc649-1cd4-496e-a184-d1f7429dfedb",
    label: "Package Planning Fee",
    rate_paise: 500000,
    qty_rule: "once_per_file",
    sort_order: 1
  },
  {
    id: "9f227e5a-fa1c-4667-9a51-4ad4ba6476c6",
    service_id: "b22bc649-1cd4-496e-a184-d1f7429dfedb",
    label: "Per-Traveller Service Charge",
    rate_paise: 200000,
    qty_rule: "per_person",
    sort_order: 2
  },
  {
    id: "46c18e71-ecff-4d34-ac46-a7982f9ecf6e",
    service_id: "c892373a-7a82-44ec-afb0-4843eeeb65a3",
    label: "Package Planning Fee",
    rate_paise: 200000,
    qty_rule: "once_per_file",
    sort_order: 1
  },
  {
    id: "e0513edd-fe7c-4213-bff5-f0adf337f4fd",
    service_id: "c892373a-7a82-44ec-afb0-4843eeeb65a3",
    label: "Per-Traveller Service Charge",
    rate_paise: 100000,
    qty_rule: "per_person",
    sort_order: 2
  },
  {
    id: "ffd71782-176e-45ef-8222-e8e53d7771da",
    service_id: "d43167e5-5198-455e-9088-8808de572fc8",
    label: "Passport Renewal Assistance",
    rate_paise: 100000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "9ae4b284-942a-4043-a2cf-4ee7a12a07f2",
    service_id: "e2b4e47b-b2da-4d62-9701-112a0cda5bfb",
    label: "Passport Application Assistance",
    rate_paise: 150000,
    qty_rule: "per_person",
    sort_order: 1
  },
  {
    id: "1fa62b8a-3995-43ec-ab3a-bd1b323bb7f1",
    service_id: "f407603c-e648-4a5a-bb3a-27349a09cd37",
    label: "Ticketing Service Charge",
    rate_paise: 100000,
    qty_rule: "per_person",
    sort_order: 1
  }
];

export function rulesFor(serviceId: string): Rule[] {
  return RULES.filter((r) => r.service_id === serviceId);
}
