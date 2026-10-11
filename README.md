# AKS Elite Dental Clinic Management System
**AK's Elite Dental Clinic & Multi-Speciality Dental Hospital, K.Pudur, Madurai**  
Lead Clinician: Dr. Khalidh Khan (BDS, MDS - Conservative Dentistry & Endodontics)

---

## Current Status: Phase 1 (Core Application) Completed & Verified

### Architecture & System Overview
- **Backend**: NestJS Modular Monolith (`apps/api`), Prisma ORM (`apps/api/prisma`), Node 24+, TypeScript
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS (`apps/web`), TanStack Query, Lucide Icons
- **Database**: SQLite (`apps/api/prisma/dev.db`) for immediate zero-dependency local dev; PostgreSQL schema ready (`schema.postgresql.prisma`) with Docker Compose (`docker-compose.yml`) for production.
- **Security & RBAC**: Argon2id password hashing, HTTP-only secure cookie sessions, role-based access control (`CLINIC_ADMIN`, `DENTIST`, `RECEPTIONIST`, `ACCOUNTANT`).
- **Audit Logging**: Immutable logging of all authentication events, patient registrations, appointments, and clinical record changes.

---

## Live Services
- **Backend API**: `http://localhost:3001`
- **OpenAPI / Swagger Documentation**: `http://localhost:3001/api/docs`
- **Frontend Web Application**: `http://localhost:5173`

---

## Default Staff Credentials (Synthetic Development Data)
| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Dentist** | Dr. Khalidh Khan (BDS, MDS) | `dr.khalidh@akselitedental.com` | `Dentist@12345` |
| **Receptionist** | Priya R. | `reception@akselitedental.com` | `Reception@12345` |
| **Clinic Admin** | Clinic Administrator | `admin@akselitedental.com` | `Admin@12345` |
| **Accountant** | Senthil K. | `accounts@akselitedental.com` | `Accounts@12345` |

---

## Tested & Verified Workflows (E2E)
- [x] Secure authentication with Argon2id and session cookies
- [x] Front-desk waiting lounge queue & 1-click status transitions (`SCHEDULED` -> `CHECKED_IN` -> `IN_CHAIR` -> `COMPLETED`)
- [x] Patient intake with duplicate phone detection and medical history (Allergies, Diabetes, Hypertension)
- [x] Operatory scheduling with multi-chair allocation (Chair 1, Chair 2, Chair 3) and conflict rejection
- [x] Doctor consultation desk with clinical examination, FDI tooth-specific diagnosis, and record finalization locking
- [x] Auditable clinical amendments preserving original medical notes
- [x] Clinic admin audit log trail recording every transaction