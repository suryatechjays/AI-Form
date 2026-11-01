# Software Requirements Specification (SRS)
## AI-Powered Smart Patient Registration System

**Document Identifier:** SRS-AEGIS-2026-V2.0  
**Document Version:** 2.0.0 (Consolidated Master Specification)  
**Publication Date:** October 28, 2026  
**Status:** Approved / Consolidated Master Baseline  
**Target Systems:** Web Application (Responsive Desktop, Tablet & Mobile)  
**Standard Compliance:** IEEE Std 830-1998 / ISO/IEC/IEEE 29148:2018 / HIPAA Security & Privacy Rules (45 CFR Parts 160 & 164) / WCAG 2.1 Level AA  

---

## Executive Summary & Document Control

This document represents the consolidated, authoritative **Software Requirements Specification (SRS)** for the **AI-Powered Smart Patient Registration System**. It unifies and finalizes all architectural, functional, non-functional, security, clinical, and operational requirements previously approved across the system's development iterations.

### Core Technology Stack Alignment
The system strictly adheres to the following approved technology baseline:
- **Frontend Framework:** React.js (Single Page Application architecture with Vite build pipeline)
- **Styling & Design System:** Tailwind CSS (Responsive mobile-first layout with high-contrast accessibility)
- **API Client:** Axios (With centralized error interceptors, authentication bearer token injection, and timeout management)
- **Backend Service:** Python 3.11+ using FastAPI (Asynchronous RESTful ASGI framework with Pydantic v2 data validation)
- **Relational Persistence:** SQLite with Write-Ahead Logging (WAL) mode enabled for ACID transactions
- **Object-Relational Mapping:** SQLAlchemy 2.0 (Providing clean schema abstraction and future migration capability to PostgreSQL)
- **Artificial Intelligence Engine:** Groq Cloud API (High-throughput inference for structured clinical entity extraction)
- **PDF Text Extraction:** PyMuPDF (`fitz`) on backend; `pdfjs-dist` for client-side document rendering and text layer preview
- **Optical Character Recognition (OCR):** Tesseract OCR (Backend processing for scanned documents, camera captures, and non-text PDFs)
- **Speech-to-Text (STT):** Browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
- **Text-to-Speech (TTS):** Browser-native Web Speech Synthesis API (`window.speechSynthesis`)
- **PDF Document Generation:** WeasyPrint (Backend Python engine with Cairo, Pango, and CSS Paged Media layout compilation)
- **Containerization & Deployment:** Docker and Docker Compose (Multi-stage container definitions for frontend, backend, and static volumes)

---

## Table of Contents

1. [Introduction, Purpose & Objectives](#1-introduction-purpose--objectives)
2. [Architecture Principles & System Mandates](#2-architecture-principles--system-mandates)
3. [User Roles, Hierarchy & Account Management](#3-user-roles-hierarchy--account-management)
4. [Functional Requirements: Authentication & Session Management (FR-AUTH)](#4-functional-requirements-authentication--session-management-fr-auth)
5. [Functional Requirements: Patient Registration Form Subsystem (FR-REG)](#5-functional-requirements-patient-registration-form-subsystem-fr-reg)
6. [Functional Requirements: Document Upload & AI Extraction Subsystem (FR-DOC-AI)](#6-functional-requirements-document-upload--ai-extraction-subsystem-fr-doc-ai)
7. [Functional Requirements: Voice Interaction Subsystem (FR-VOICE)](#7-functional-requirements-voice-interaction-subsystem-fr-voice)
8. [Functional Requirements: Form Validation, Review, Duplicate Detection & Submission (FR-VAL-SUB)](#8-functional-requirements-form-validation-review-duplicate-detection--submission-fr-val-sub)
9. [Functional Requirements: PDF Generation & Download Subsystem (FR-PDF)](#9-functional-requirements-pdf-generation--download-subsystem-fr-pdf)
10. [Non-Functional Requirements: Security, Privacy & Data Protection (NFR-SEC)](#10-non-functional-requirements-security-privacy--data-protection-nfr-sec)
11. [Non-Functional Requirements: Error Handling, Reliability & Fault Tolerance (NFR-ERR-REL)](#11-non-functional-requirements-error-handling-reliability--fault-tolerance-nfr-err-rel)
12. [Non-Functional Requirements: Performance, Scalability, Usability & Maintainability (NFR-PSUM)](#12-non-functional-requirements-performance-scalability-usability--maintainability-nfr-psum)
13. [Role-Based Access Control (RBAC) Matrix](#13-role-based-access-control-rbac-matrix)
14. [Technology Stack, System Constraints & Assumptions](#14-technology-stack-system-constraints--assumptions)
15. [Measurable Acceptance Criteria (AC)](#15-measurable-acceptance-criteria-ac)
16. [MVP Feature Scope vs. Future Enhancements](#16-mvp-feature-scope-vs-future-enhancements)
17. [Consistency, Quality Review & Risk Analysis](#17-consistency-quality-review--risk-analysis)
18. [Document Sign-Off & High-Level Design (HLD) Readiness](#18-document-sign-off--high-level-design-hld-readiness)

---

## 1. Introduction, Purpose & Objectives

### 1.1 Purpose
The purpose of the **AI-Powered Smart Patient Registration System** is to transform clinical intake and front-desk admissions. By eliminating manual data entry bottlenecks, mitigating transcription errors, and streamlining document ingestion, the system accelerates registration while guaranteeing patient safety and statutory healthcare data protection.

### 1.2 Clinical & Operational Objectives
1. **Accelerate Patient Intake:** Reduce average front-desk patient intake time from 8–12 minutes down to under 3 minutes per patient through multi-modal input (PDF ingestion, camera OCR, voice dictation, and smart form pre-filling).
2. **Mitigate Clinical Errors:** Provide automated extraction of critical clinical entities (allergies, medical conditions, medications, surgeries) from unstructured discharge notes and clinical documents with human-in-the-loop validation.
3. **Guarantee Medical Safety for Missing Data:** Never assume unmentioned clinical parameters represent negative findings; enforce explicit tri-state handling ("Positive", "Confirmed Negative", "Not Provided / Unknown").
4. **Prevent Duplicate Registrations:** Intelligently detect potential existing patient records across phone number, email, and composite identifiers (Full Name + Date of Birth) before committing new records, preventing medical record fragmentation without destructive auto-merging.
5. **Universal Accessibility:** Provide seamless assistance for elderly, visually impaired, or motor-disabled patients using Web Speech API speech-to-text dictation and full audio read-aloud review.
6. **Authoritative Clinical Dossiers:** Automatically generate standardized, publication-grade, tamper-evident registration PDF dossiers equipped with touchless triage QR codes and digital signatures using backend WeasyPrint rendering.
7. **Statutory Healthcare Compliance:** Uphold HIPAA Privacy and Security Rules (45 CFR Parts 160/164) through zero-trust PHI handling, server-side RBAC enforcement, cryptographic password hashing (Argon2id/bcrypt), comprehensive audit trails, and strict soft-deactivation policies.

### 1.3 Project Scope
The scope of this system covers the end-to-end patient registration lifecycle:
- Public and administrative authentication and account lifecycle management.
- Multi-modal data intake: manual typing, digital PDF upload (`PyMuPDF`), scanned document OCR (`Tesseract`), and voice dictation (`Web Speech API`).
- AI extraction via Groq Cloud API with local heuristic parsing fallbacks.
- Live form validation, uncertainty highlighting, dedicated review screen, and non-destructive duplicate detection.
- Transactional ACID persistence in SQLite via SQLAlchemy.
- Backend PDF compilation via WeasyPrint with authenticated, role-based streaming.
- Role-based portals for Patients, Receptionists, Assistant Administrators, and Super Users.
- Architectural packaging for containerized deployment via Docker and Docker Compose.

---

## 2. Architecture Principles & System Mandates

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CLIENT TIER (React.js SPA)                        │
│ • Tailwind CSS Presentation  • Axios Client Interceptors               │
│ • Web Speech API (STT/TTS)   • HTML5 Signature Canvas                  │
│ • Client-Side Route Guards   • pdfjs-dist Document Preview             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (JSON & Multipart)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   APPLICATION TIER (Python FastAPI)                    │
│ • Pydantic v2 Schema Validation   • JWT / Argon2id Authentication      │
│ • RBAC Authoritative Enforcement  • PyMuPDF Backend Text Extraction    │
│ • Tesseract OCR Engine Subsystem  • Groq API / Fallback Orchestrator   │
│ • WeasyPrint Cairo PDF Compiler   • Comprehensive Audit Dispatcher     │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       DATABASE PERSISTENCE           │  │     STORAGE PERSISTENCE      │
│ • SQLite (WAL Mode, Busy Timeout)    │  │ • Local Document Repository  │
│ • SQLAlchemy 2.0 ORM Mappings        │  │ • Compiled PDF Dossiers      │
│ • Soft Deactivation / Audit Records  │  │ • SHA-256 Checksum Index     │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

The system enforces eleven non-negotiable architectural mandates:

1. **Authoritative Server-Side Enforcement:** Authorization, data validation, and business rules must be enforced strictly on the **FastAPI backend**. Client-side React route guards, disabled UI buttons, and input masks are UX enhancements only and must never be trusted as security boundaries.
2. **Account Deactivation Over Permanent Deletion:** In accordance with medical record retention regulations (HIPAA § 164.312), the application strictly enforces **soft deactivation** (`is_active = FALSE`). Direct hard deletion of patient accounts or clinical histories is strictly prohibited.
3. **Clinical Safety for Medical Information:** Missing or unentered medical details must explicitly be stored and rendered as **"Not Provided"** or **"Unknown"**. The application shall **never assume that an empty field indicates the absence of allergies or medical conditions**.
4. **Duplicate Protection Without Destructive Merges:** Potential duplicate registrations must be detected and surfaced to staff for manual review. The application shall **never automatically overwrite or merge existing patient records**.
5. **Authoritative & Protected Clinical PDF Generation:** Official registration dossiers must be compiled authoritatively by the **FastAPI backend using WeasyPrint and Jinja2**. Generated PDF documents must be protected against direct public static access, stored with SHA-256 integrity hashes, and delivered strictly through authenticated, role-verified streaming endpoints.
6. **Zero-Trust PHI Protection & Storage Hygiene:** Sensitive Protected Health Information (PHI) must be safeguarded at rest and in transit (TLS 1.3). Unencrypted PHI must never reside permanently in browser `localStorage`. Magic-byte inspection, UUID filename sanitization, and path-traversal prevention must guard all uploaded files.
7. **AI Non-Diagnostic Boundary & Untrusted Input Model:** Artificial intelligence modules are strictly limited to administrative entity extraction and transcription. Document text must be treated as untrusted input with defenses against indirect prompt injection, and all AI outputs mandate human verification before submission.
8. **Transactional Atomicity & Zero Data Loss:** Every registration commit operates within atomic SQLite transactions (`BEGIN TRANSACTION ... COMMIT`). Any backend failure triggers an automatic rollback (`ROLLBACK`) preventing partial, corrupted, or orphaned records. Under temporary failures, entered user data is strictly preserved in UI state and never wiped.
9. **Fail-Fast Permanent Errors vs. Bounded Retries:** The system must strictly distinguish between fatal non-retryable failures (400 Bad Request, 401 Invalid Key, corrupted unreadable PDFs) and transient faults (429 Rate Limits, 503 Service Unavailable, SQLite database locked). Transient faults employ bounded exponential backoff with jitter and manual-entry fallbacks, while permanent errors fail fast with actionable guidance.
10. **Human-Centered Usability & WCAG 2.1 AA Accessibility:** All clinical user interfaces must maintain accessible, high-contrast visual hierarchies (4.5:1 minimum contrast), full keyboard navigation, screen-reader semantics, and responsive adaptations across desktop, tablet, and mobile devices. Manual typing and voice interaction must operate as complementary, universally available input alternatives.
11. **Architectural Modularity & Deterministic Scalability:** Frontend components and backend services must remain strictly decoupled, with independent versioning, structured configuration management via `.env`, and optimized query paths. For the MVP, SQLite write-concurrency limits (10–20 concurrent users) are managed via WAL mode and connection pooling, maintaining a clean evolutionary path to PostgreSQL via SQLAlchemy.

---

## 3. User Roles, Hierarchy & Account Management

### 3.1 Role Hierarchy & System Actors

```
                            ┌────────────────────────┐
                            │       SUPER USER       │
                            │  Complete Admin Access │
                            └───────────┬────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼ (Creates, configures &                      ▼ (Creates, manages &
                    delegates permissions)                        deactivates)
      ┌─────────────────────────┐                   ┌─────────────────────────┐
      │ ASSISTANT ADMINISTRATOR │                   │       RECEPTIONIST      │
      │ Individually Configured │                   │ Desk Intake & Roster    │
      └─────────────────────────┘                   └─────────────────────────┘
                                                               │
                                                               ▼ (Registers on behalf)
                                                    ┌─────────────────────────┐
                                                    │         PATIENT         │
                                                    │ Self-Service Intake     │
                                                    └─────────────────────────┘
```

The system recognizes four primary actor roles:

1. **PATIENT (`ROLE_PATIENT`)**:
   - Represents an external patient registering independently via self-service.
   - **Allowed Capabilities:** Self-register account, log in, view only their own registration details, upload personal medical documents, populate and submit their own registration intake form, listen to audio review of their data, and download their official registration PDF.
   - **Strict Prohibitions:** Cannot view other patients' records, search the patient database, access administrative dashboards, or create, update, or manage other user accounts.

2. **RECEPTIONIST (`ROLE_RECEPTIONIST`)**:
   - Represents hospital front-desk admissions staff and triage desk operators.
   - **Allowed Capabilities:** View all patient details across the admissions roster, create new patient registrations on behalf of walk-in patients, upload and process patient documents, execute AI extraction (PyMuPDF and Tesseract OCR), edit patient registration details, review duplicate record warnings, link registrations to existing profiles, and download generated registration PDFs.
   - **Strict Prohibitions:** Cannot create, update, or delete user accounts (including their own or other staff accounts); cannot delete patient records.

3. **ASSISTANT ADMINISTRATOR (`ROLE_ASSISTANT_ADMIN`)**:
   - Represents a delegated administrative officer created **only by the Super User**.
   - **Allowed Capabilities:** Receives **individually configurable permissions** assigned on a per-account basis by the Super User. Can only perform explicitly assigned operations (e.g., viewing audit logs, managing receptionist accounts, or downloading reporting exports).
   - **Strict Prohibitions:** Cannot create another Assistant Administrator or Super User account; cannot modify, extend, or elevate their own permissions under any circumstance.

4. **SUPER USER (`ROLE_SUPER_USER`)**:
   - Represents executive clinical administrators with **complete administrative access**.
   - **Allowed Capabilities:** View, create, and edit all patient registrations; create and manage Receptionist accounts; create and manage Assistant Administrator accounts; configure and fine-tune granular Assistant Administrator permissions; deactivate any user account; view complete system activity and audit logs; manage application and facility settings (clinic name, branding, logo, contact info); and manage database maintenance and disaster recovery procedures.

### 3.2 Account Management Lifecycle

#### 3.2.1 Patient Account Management
- **Self-Registration:** Unauthenticated users can access the registration portal and self-register by providing their full name, email, mobile phone number, and a secure password.
- **Account Scope:** Self-registered patient accounts are automatically assigned the role `ROLE_PATIENT`.
- **Profile Updates:** Patients can log in to update permitted demographic fields (e.g., residential address, emergency contact, phone number) and upload updated clinical reports.
- **Access Boundary:** Patients are strictly quarantined to records where `patient_id == current_user.id`.

#### 3.2.2 Receptionist Account Management
- **Creation Authority:** Receptionist accounts can only be created by the Super User (or an Assistant Administrator explicitly granted `accounts:receptionist_manage`).
- **No Self-Provisioning:** Receptionists cannot create their own accounts, cannot create other receptionist accounts, and cannot modify account credentials other than changing their own password.
- **Intake Governance:** Receptionists operate on the admissions roster to perform triage intake and document processing.

#### 3.2.3 Assistant Administrator Account Management
- **Super User Exclusivity:** Assistant Administrators can be provisioned **strictly and exclusively by the Super User**.
- **Granular Permission Assignment:** The Super User configures specific scopes from the permission matrix:
  - `records:view_all`, `records:edit`, `documents:upload_all`, `ai:execute`, `pdf:download_all`, `accounts:patient_manage`, `accounts:receptionist_manage`, `audit:view`, `settings:manage`.
- **Immutable Self-Privilege:** The backend enforces that an Assistant Administrator can never edit their own permissions (`target_user_id != current_user.id` when modifying permissions).

#### 3.2.4 Super User Account Management
- **Root Provisioning:** Initial Super User is initialized during application bootstrap via secure environment variables (`SUPERUSER_DEFAULT_USERNAME`, `SUPERUSER_DEFAULT_PASSWORD`).
- **Account Governance:** Super Users maintain full oversight of all accounts, permission delegations, and security configurations.

---

## 4. Functional Requirements: Authentication & Session Management (FR-AUTH)

### 4.1 Authentication Specification
* **FR-AUTH-01: Multi-Role Secure Login**
  * The backend shall provide a single unified authentication endpoint `POST /api/v1/auth/login`.
  * Authenticates Patients, Receptionists, Assistant Administrators, and Super Users against salted and hashed passwords stored in SQLite.
  * Checks that the account is active (`is_active == 1`). Deactivated accounts return HTTP 403 Forbidden with `"detail": "Account deactivated. Please contact clinical administration."`.
  * Issues a cryptographically signed JWT Access Token (15-minute expiration) with payload: `{"sub": user_id, "role": role_name, "permissions": [...], "exp": ...}`.
  * Issues a high-entropy Refresh Token (7-day sliding expiration) set in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
* **FR-AUTH-02: Role-Based Dashboard Redirection**
  * Upon successful authentication, the React client inspects the decoded JWT role and automatically routes the user:
    * `ROLE_PATIENT` $\rightarrow$ `/patient/portal` (Personal intake form, document uploader, personal records)
    * `ROLE_RECEPTIONIST` $\rightarrow$ `/reception/desk` (Intake wizard, patient admissions roster, queue)
    * `ROLE_ASSISTANT_ADMIN` $\rightarrow$ `/admin/workspace` (Delegated administrative panels matching permitted scopes)
    * `ROLE_SUPER_USER` $\rightarrow$ `/super-user/dashboard` (Full console, account governance, audit logs, system settings)
* **FR-AUTH-03: Authoritative Backend Route Guarding**
  * All protected FastAPI endpoints must declare security dependencies using `Depends(get_current_active_user)` and `SecurityScopes`.
  * If a request lacks a valid token or the authenticated role does not possess the required scope, FastAPI returns HTTP 401 Unauthorized or HTTP 403 Forbidden, regardless of frontend UI state.
* **FR-AUTH-04: Secure Logout & Token Revocation**
  * Calling `POST /api/v1/auth/logout` invalidates the active session.
  * The backend hashes the refresh token and appends it to the SQLite `revoked_tokens` table.
  * Clears the `HttpOnly` refresh cookie (`Max-Age=0`).
  * The React client clears all in-memory token state and redirects to `/login`.
* **FR-AUTH-05: Session Expiration & Silent Refresh**
  * The React Axios client interceptor detects HTTP 401 token expiration errors.
  * Automatically attempts a single silent token refresh via `POST /api/v1/auth/refresh`.
  * If the refresh token is expired or revoked, Axios clears state and redirects the user to `/login` with an informational banner: *"Your session has expired. Please log in again."*
* **FR-AUTH-06: Self-Service Password Reset**
  * Initiated via `POST /api/v1/auth/password-reset-request`. Generates a single-use, 15-minute cryptographically random token (`secrets.token_urlsafe(32)`).
  * Password update finalized via `POST /api/v1/auth/password-reset-confirm`. Automatically revokes all existing active sessions for that user upon reset.

---

## 5. Functional Requirements: Patient Registration Form Subsystem (FR-REG)

The Patient Registration Form is the core clinical intake dossier. It is structured into seven distinct sections, supports multi-modal input channels, and enforces rigorous clinical safety rules.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PATIENT REGISTRATION FORM SECTIONS                   │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Personal Information        │ Name, DOB, Age (Auto), Gender, Blood  │
├────────────────────────────────┼───────────────────────────────────────┤
│ 2. Contact Information         │ Mobile (E.164), Email, Address, PIN   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 3. Emergency Contact           │ Name, Relationship, Emergency Phone   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 4. Medical Information         │ Conditions, Surgeries, Meds, Allergies│
│    (Strict Tri-State Mandate)  │ "Not Provided" / "Unknown" Defaults   │
├────────────────────────────────┼───────────────────────────────────────┤
│ 5. Insurance Information       │ Provider, Policy #, Holder, Expiry    │
├────────────────────────────────┼───────────────────────────────────────┤
│ 6. Appointment Information     │ Doctor, Department, Reason, Date      │
├────────────────────────────────┼───────────────────────────────────────┤
│ 7. System-Generated Metadata   │ Patient ID, Reg ID, Timestamp, Status │
└────────────────────────────────┴───────────────────────────────────────┘
```

### 5.1 Form Sections Detailed Specification

#### 5.1.1 Section 1: Personal Information
- **Full Name (Mandatory):** String (2–100 characters), sanitized against XSS, alphabet and punctuation characters only (`^[a-zA-Z\s\.\'\-]+$`).
- **Date of Birth (Mandatory):** ISO-8601 Date (`YYYY-MM-DD`). Must represent a past date ($\text{DOB} \le \text{Current Date}$) and satisfy the biological threshold ($\text{DOB} \ge \text{Current Date} - 125 \text{ years}$).
- **Age (Mandatory, Automatically Calculated):** Non-editable integer derived dynamically from Date of Birth. If $\text{Age} < 18$, the form triggers a conditional prompt requiring Guardian/Emergency contact information.
- **Gender (Mandatory):** Enumerated selection: `Male`, `Female`, `Other`, `Prefer Not to Say`.
- **Blood Group (Optional):** Enumerated selection: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `Unknown`. Defaults to `Unknown` if not provided.
- **Profile Photo (Optional):** JPEG/PNG image upload (max 2 MB), cropped to 1:1 aspect ratio, stored in `/storage/patient_photos/` with sanitized UUID filename.

#### 5.1.2 Section 2: Contact Information
- **Mobile Number (Mandatory):** Validated against ITU-T E.164 international standard (`^\+?[1-9]\d{7,14}$`), supporting 8 to 15 digits. Serves as a primary identifier for duplicate detection.
- **Email Address (Optional):** Validated against RFC 5322 syntax (`^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$`).
- **House Number / Street (Optional):** Free-form string (max 255 characters).
- **City (Optional):** String (max 100 characters).
- **State / Province (Optional):** String (max 100 characters).
- **Country (Optional):** String (max 100 characters), defaults to configured facility default country.
- **PIN Code / Postal Code (Optional):** Alphanumeric string (3–10 characters) matching `^[a-zA-Z0-9\-\s]{3,10}$`.

#### 5.1.3 Section 3: Emergency Contact Information
- **Contact Person Name (Optional):** String (2–100 characters). Mandatory if patient is a minor ($\text{Age} < 18$).
- **Relationship (Optional):** Enumerated/Text: `Parent`, `Spouse`, `Child`, `Sibling`, `Guardian`, `Relative`, `Friend`, `Other`.
- **Emergency Contact Number (Conditional):** Mandatory if Contact Person Name is populated. Validated against E.164 phone standard. Must not be identical to the patient's primary mobile number.

#### 5.1.4 Section 4: Medical Information
* **CLINICAL SAFETY MANDATE:** Missing or unentered medical fields must be explicitly stored and displayed as **"Not Provided"** or **"Unknown"**. The application shall **never assume that an empty field indicates the absence of allergies or conditions**.
* Fields:
  - **Existing Medical Conditions:** Text description or comma-separated list. Defaults to `"Not Provided"`.
  - **Previous Surgeries:** Text description with optional approximate years. Defaults to `"None Reported"`.
  - **Current Medications:** Text description of active prescriptions and dosages. Defaults to `"Not Provided"`.
  - **Known Allergies (High Clinical Risk):** Food, drug, or environmental allergies. The system provides a tri-state selection:
    1. *Active Allergies Listed:* Populated with specific substances and reaction severities.
    2. *No Known Allergies (NKDA):* Explicitly confirmed negative finding.
    3. *Not Provided / Unknown:* Unconfirmed status, highlighted with a clinical warning badge on the review screen.
  - **Previous Medical History:** Historical illnesses, hospitalizations, or chronic conditions. Defaults to `"Not Provided"`.
  - **Disability Information (Optional):** Physical, sensory, or cognitive accessibility accommodations required during the visit.

#### 5.1.5 Section 5: Insurance Information (Optional)
- **Insurance Provider:** String (max 100 characters).
- **Policy Number:** Alphanumeric string (max 50 characters).
- **Policy Holder Name:** String (max 100 characters).
- **Policy Expiry Date:** ISO-8601 Date (`YYYY-MM-DD`). Must not be in the past if provided.

#### 5.1.6 Section 6: Appointment Information (Optional)
- **Preferred Doctor:** Doctor name or ID from staff roster.
- **Department / Speciality:** Clinical department (e.g., General Medicine, Cardiology, Orthopedics, Pediatrics, Dermatology).
- **Reason for Visit:** String (max 500 characters) describing presenting complaints or symptoms.
- **Preferred Appointment Date:** ISO-8601 Date (`YYYY-MM-DD`). Must not be in the past ($\ge \text{Current Date}$).

#### 5.1.7 Section 7: System-Generated Metadata
- **Patient ID (`PID`):** Unique permanent patient identifier (format: `PID-YYYY-XXXXX`).
- **Registration ID (`RegID`):** Unique encounter identifier (format: `AEGIS-YYYY-XXXXX`).
- **Registration Date and Time:** ISO-8601 UTC timestamp.
- **Registration Status:** State machine attribute: `DRAFT`, `PENDING_REVIEW`, `SUBMITTED`, `REJECTED`.

### 5.2 Multi-Modal Input Modalities
The form subsystem seamlessly ingests data via three complementary modalities:
1. **Manual Text Entry:** Progressive 6-step form wizard with real-time field validation, keyboard shortcuts, and tab ordering.
2. **Document Upload & AI Extraction:** Drag-and-drop file ingestion (PDF, PNG, JPG) with automated parsing and field population.
3. **Voice Interaction:** Web Speech API dictation enabling hands-free field input and conversational entry.

---

## 6. Functional Requirements: Document Upload & AI Extraction Subsystem (FR-DOC-AI)

```
┌────────────────────────────────────────────────────────────────────────┐
│              DOCUMENT INGESTION & AI EXTRACTION PIPELINE               │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Document Upload  │ PDF / JPG / PNG (Max 10 MB)                      │
│                     │ Magic-byte MIME verification & UUID renaming     │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 2. Text Extraction  │ • Digital PDF -> Backend PyMuPDF (fitz)          │
│                     │ • Scanned Images -> Tesseract OCR Engine         │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 3. AI NLP Analysis  │ Groq API (High-speed LLaMA 3.3 inference)        │
│                     │ Structured JSON extraction against strict schema │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 4. Fallback Engine  │ Local heuristic regex & rule-based parser        │
│                     │ (Operates if Groq API is offline / rate-limited) │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 5. UI Population    │ Auto-fills form wizard with confidence scores    │
│                     │ Amber highlight on uncertain fields (<70% conf)  │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 6. Human Gatekeeper │ Staff / Patient reviews and confirms each field  │
│                     │ AI output is NEVER submitted automatically       │
└─────────────────────┴──────────────────────────────────────────────────┘
```

### 6.1 Document Ingestion & Validation
* **Supported Formats:** Portable Document Format (`application/pdf`), JPEG (`image/jpeg`), and PNG (`image/png`).
* **File Size Limit:** Maximum 10 MB per file.
* **MIME & Magic-Byte Verification:** Uploaded files must be validated using magic-byte headers (`%PDF` for PDF, `\xFF\xD8\xFF` for JPEG, `\x89PNG\r\n\x1a\n` for PNG). Files with spoofed extensions must be rejected immediately with HTTP 415 Unsupported Media Type.
* **Storage Hygiene:** Files are stored in an isolated filesystem directory `/storage/uploaded_documents/` using randomized UUIDv4 filenames (e.g., `550e8400-e29b-41d4-a716-446655440000.pdf`). Original filenames are sanitized and recorded in database metadata only.
* **Client Preview:** The React client utilizes `pdfjs-dist` to render an inline, multi-page canvas preview of uploaded PDFs, allowing the user to view the source document side-by-side with extracted form fields.

### 6.2 Text Extraction Engine (PyMuPDF & Tesseract OCR)
* **Backend Digital PDF Extraction (PyMuPDF):**
  * When a PDF is received, the FastAPI backend processes the file using **PyMuPDF (`fitz`)**.
  * PyMuPDF extracts vector text layers, page boundaries, and structured blocks with sub-second performance.
* **Backend Scanned Document & Image OCR (Tesseract):**
  * If a PDF contains no embedded text layers (scanned document) or if the uploaded file is an image (JPG/PNG), the backend routes the file to the **Tesseract OCR engine**.
  * Pre-processing applies grayscale conversion, thresholding, and contrast normalization using Pillow (`PIL`) before executing Tesseract character recognition.
* **Frontend Intake Extraction Fallback:**
  * For lightweight offline environments, the frontend client can perform client-side text layer parsing via `pdfjs-dist` and fallback OCR via `tesseract.js`.

### 6.3 AI-Based Clinical Entity Extraction (Groq API)
* **Inference Pipeline:**
  * Raw extracted text is transmitted from the FastAPI backend to the **Groq Cloud API** using high-speed LLaMA 3.3 models.
  * System prompt instructs the model to act as a clinical entity parser, extracting patient demographics, contact details, emergency contacts, medical history, allergies, and medications into a structured JSON schema.
* **Prompt Injection Defense & Untrusted Text Boundary:**
  * All raw document text is strictly wrapped within delimiter tags (`<clinical_document_text>...</clinical_document_text>`).
  * System instructions forbid the model from executing commands, evaluating markdown directives, or interpreting instructions contained inside the document text.
* **Confidence Scoring & Uncertainty Flagging:**
  * The Groq extraction response returns an extraction confidence score ($0.00$ to $1.00$) for each parsed field.
  * Fields with confidence $< 0.70$ (70%) are flagged as "Uncertain" and highlighted in the React UI with an amber border and an alert icon: *"Low confidence extraction. Please verify."*
* **Heuristic Fallback Engine:**
  * If the Groq API returns HTTP 429 (rate limit), 503 (service unavailable), or request timeout, the system automatically falls back to an internal Python rule-based regex parser.
  * The heuristic parser extracts phone numbers (E.164), emails, dates (DOB), PIN codes, and common medical keywords without external network dependency.
* **Mandatory Human-in-the-Loop Gatekeeper:**
  * AI-extracted data is strictly provisional. Extracted fields populate the form wizard for human review.
  * The system **shall never automatically submit a registration from AI extraction without explicit user review and confirmation**.

---

## 7. Functional Requirements: Voice Interaction Subsystem (FR-VOICE)

```
┌────────────────────────────────────────────────────────────────────────┐
│                   VOICE INTERACTION SUBSYSTEM (STT/TTS)                │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Speech-to-Text   │ Web Speech API (window.SpeechRecognition)        │
│    (STT Dictation)  │ Inline mic controls per field + global intake    │
│                     │ Live transcription with manual edit ability      │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 2. Text-to-Speech   │ Web SpeechSynthesis API (speechSynthesis)        │
│    (TTS Readout)    │ Reads individual fields or full review screen    │
│                     │ Play, Pause, Resume, Stop controls (0.75x-1.25x) │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 3. Voice States     │ Inactive -> Listening (Pulse) -> Processing      │
│                     │ Graceful fallback on mic permission denial       │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 4. Safety Guarantee │ Voice input NEVER triggers automatic submit      │
│                     │ Pre-existing data preserved on voice failure     │
└─────────────────────┴──────────────────────────────────────────────────┘
```

### 7.1 Speech-to-Text (STT) Specification
* **Technology:** Browser-native Web Speech API (`window.SpeechRecognition` or `window.webkitSpeechRecognition`).
* **Field-Level Dictation:** Every text-based registration field (Full Name, Address, Medical Conditions, Allergies, Reason for Visit) is equipped with a microphone icon button.
* **Conversational Multi-Entity Speech Intake:** The system provides an optional "Voice Assistant" mode where a patient or receptionist can speak naturally (e.g., *"My name is Jane Doe, born on May 12, 1988, mobile 555-0199, allergic to penicillin"*). The audio is transcribed and parsed to populate corresponding form fields.
* **Live Transcription & Editing:** Transcribed text appears immediately in the target field. Users can edit, backspace, or append to the transcribed text using the keyboard at any time.
* **Retry & Clear:** A retry button allows re-recording the field value, replacing the transcription cleanly.
* **Permission & Error Handling:**
  * If microphone permission is denied, the UI displays an inline banner explaining how to grant microphone access in browser settings.
  * If the browser does not support the Web Speech API (e.g., legacy browsers), microphone icons are gracefully hidden with an informational tooltip, leaving manual typing fully functional.
  * If recognition fails due to silence, background noise, or network interruption, the system displays a gentle notification (*"Could not hear speech clearly. Please try again or type manually."*).
* **Data Preservation:** A speech recognition error or timeout shall **never clear or overwrite existing field data**.

### 7.2 Text-to-Speech (TTS) Specification
* **Technology:** Browser-native Web Speech Synthesis API (`window.speechSynthesis`).
* **Field-Level Audio Verification:** A speaker icon button next to each field reads the current field label and entered value aloud (e.g., *"Known Allergies: Penicillin, causing rash"*).
* **Full-Form Review Readout:** On the dedicated Form Review screen, a master audio control bar allows the patient to listen to their complete registration dossier from top to bottom.
* **Audio Player Controls:**
  * **Play / Start:** Begins sequential audio readout from the beginning or selected section.
  * **Pause / Resume:** Temporarily suspends speech synthesis and resumes without restarting.
  * **Stop:** Halts speech synthesis and resets reading position.
  * **Speed Adjustment:** Slider or toggle supporting $0.75\times$ (slow/clear), $1.0\times$ (normal), and $1.25\times$ (fast) playback speeds.
* **Synchronized Visual Highlighting:** As speech synthesis reads a field, the corresponding card or form field in the UI is highlighted with a distinct high-contrast focus border, providing dual-sensory verification.

### 7.3 Accessibility & Safety Mandates
* Voice interactions are strictly assistive. All features must be fully operable via keyboard and mouse alone.
* Speech recognition shall **never automatically trigger form submission**. Form submission requires an explicit physical gesture (clicking the "Submit Registration" button or activating it via keyboard Enter/Space).

---

## 8. Functional Requirements: Form Validation, Review, Duplicate Detection & Submission (FR-VAL-SUB)

### 8.1 Multi-Tier Form Validation Rules (FR-VAL)
The application enforces identical validation rules across manual entries and AI-extracted data:

| Field Identifier | Validation Pattern / Rule | Error Message / Enforcement Action |
| :--- | :--- | :--- |
| **Full Name** | `^[a-zA-Z\s\.\'\-]{2,100}$` (Non-whitespace) | *"Full Name is required (2–100 alphabetic characters)."* |
| **Date of Birth** | Valid ISO-8601 date; $\text{DOB} \le \text{Today}$ and $\ge \text{Today} - 125\text{y}$ | *"Date of Birth must be a valid historical date within the last 125 years."* |
| **Age** | Auto-derived from DOB; non-editable | Non-editable. Recomputed automatically upon DOB change. |
| **Gender** | Enumeration: `Male`, `Female`, `Other`, `Prefer Not to Say` | *"Please select a valid gender option."* |
| **Mobile Number** | ITU-T E.164: `^\+?[1-9]\d{7,14}$` (8–15 digits) | *"Mobile number must be a valid phone number (8–15 digits) with country code."* |
| **Email Address** | RFC 5322: `^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$` | *"Please enter a valid email address (e.g., patient@example.com)."* |
| **PIN Code** | Alphanumeric: `^[a-zA-Z0-9\-\s]{3,10}$` | *"Postal code must be between 3 and 10 alphanumeric characters."* |
| **Emergency Phone** | E.164 standard; must not match patient mobile | *"Emergency contact number cannot be identical to patient mobile number."* |
| **Medical Fields** | Mandatory non-empty string; defaults to `"Not Provided"` | Empty values automatically normalized to `"Not Provided"`. |
| **Appointment Date** | ISO-8601 date; $\ge \text{Current Date}$ | *"Preferred appointment date cannot be in the past."* |
| **Patient Consent** | Boolean: `True` required | *"You must review and accept the patient consent declaration to proceed."* |

### 8.2 Missing Information Detection & Clinical Uncertainty (FR-MISS)
- **Visual Section Error Badges:** The multi-step form wizard displays red indicator badges on tabs containing missing or invalid mandatory fields.
- **Uncertain Extraction Indicators:** Fields populated via AI with confidence $< 0.70$ are highlighted with an amber border and warning tooltip.
- **Clinical Tri-State Display:** Medical conditions and allergies are rendered with explicit visual tags:
  - Green Tag: *"Confirmed Negative (NKDA)"*
  - Blue Tag: *"Documented Condition / Allergy"*
  - Amber Alert Tag: *"Not Provided / Unknown - Clinical Assessment Required"*

### 8.3 Dedicated Form Review Screen (FR-REV)
Before submission, users are directed to a comprehensive, read-only summary screen displaying:
- Complete breakdown of all seven form sections in clean, high-contrast cards.
- Side-by-side or collapsible view of source uploaded documents.
- Audio readout control bar with speed adjustments and field-by-field highlighting.
- Inline "Edit" button on each section card, returning the user to that specific form step with entered data fully preserved.
- HTML5 Canvas Digital Signature Pad: Allows the patient or authorized guardian to provide an ink signature using mouse, stylus, or touch screen.
- Statutory Medical Consent Declaration checkbox.

### 8.4 Duplicate Patient Detection Subsystem (FR-DUP)
To prevent medical record fragmentation, the system executes an automated duplicate check before registration persistence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DUPLICATE DETECTION MATCHING LOGIC                   │
├────────────────────────────────────────────────────────────────────────┤
│ Match Criterion 1: Exact Mobile Match (E.164 phone number)             │
│ Match Criterion 2: Exact Email Match (RFC 5322 lowercase string)       │
│ Match Criterion 3: Composite Match (Full Name [normalized] + Exact DOB)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Match Identified
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NON-DESTRUCTIVE RESOLUTION DRAWER                    │
│ • Surfaces existing Patient ID, Name, Mobile, and Registration Date    │
│ • Staff Action 1: Link new registration to existing Patient Profile    │
│ • Staff Action 2: Confirm new patient (Requires documented reason)     │
│ • STRICT MANDATE: Records are NEVER automatically merged or overwritten│
└────────────────────────────────────────────────────────────────────────┘
```

- **Non-Destructive Principle:** The system **never automatically merges or overwrites records**.
- **Staff Review Drawer:** When a match is detected:
  - If registered by a Receptionist/Admin, a slide-out drawer displays matching record details (masking sensitive medical data). The staff member can choose to:
    1. *Link Registration:* Attach this new encounter to the existing permanent `PID`.
    2. *Create New Profile:* Proceed with a distinct record after documenting an override justification (logged to audit trail).
  - If self-registered by a Patient, the system prompts: *"An account with this mobile number/email already exists. Please log in to view your records or reset your password."*

### 8.5 The 11-Step Submission Lifecycle (FR-SUB)
The registration submission executes across eleven strict stages:

```
[React SPA] Validate Form -> Construct Payload -> Include Idempotency Key
                                   │
                                   ▼ Axios POST /api/v1/registrations
[FastAPI] Bearer Token Auth -> Pydantic Schema Check -> Duplicate Query
                                   │
                                   ▼ SQLite Transaction
[SQLite] BEGIN TRANSACTION -> Insert Patient / Registration -> COMMIT
                                   │
                                   ▼ Background Execution
[WeasyPrint] Render Jinja2 HTML -> Cairo PDF Compile -> SHA-256 Storage
                                   │
                                   ▼ Response
[React SPA] Receive HTTP 201 Created -> Display Success & PDF Download
```

1. **Client-Side Validation:** React validates all fields; blocks dispatch if any mandatory constraint fails.
2. **Payload Serialization & Idempotency:** Serializes data into a JSON payload; includes a unique `X-Idempotency-Key: <UUIDv4>` header to prevent double-submit.
3. **Axios Dispatch:** Dispatches `POST /api/v1/registrations` over HTTPS.
4. **Backend Authentication & RBAC Check:** FastAPI verifies JWT claims and caller permissions.
5. **Pydantic Schema Validation:** FastAPI validates all payload types, bounds, and string constraints.
6. **Backend Duplicate Check:** Queries SQLite for duplicate phone, email, or composite name+DOB.
7. **Atomic SQLite Transaction:**
   - Begins transaction (`BEGIN TRANSACTION`).
   - Inserts/updates `patients` table.
   - Generates unique permanent Patient ID (`PID-YYYY-XXXXX`) and Registration ID (`AEGIS-YYYY-XXXXX`).
   - Inserts `registrations` record with status `SUBMITTED`.
   - Inserts digital signature binary blob (`data:image/png;base64,...`).
   - Inserts audit event `PATIENT_REGISTERED` into `audit_events`.
   - Commits transaction (`COMMIT`).
8. **Asynchronous PDF Trigger:** Dispatches a FastAPI background task (`BackgroundTasks`) to compile the registration PDF via WeasyPrint.
9. **API Response:** Returns HTTP 201 Created with JSON envelope containing `registration_id`, `patient_id`, and status.
10. **UI State Transition:** React transitions wizard to the Confirmation Screen with celebratory success banner, encounter summary, and immediate PDF download trigger.
11. **Draft State Cleanup:** Local storage draft cache is purged upon successful submission.

### 8.6 Registration Status State Machine (FR-STAT)
- **`DRAFT`:** Work-in-progress intake. Editable by creator. Not visible on admissions triage queue.
- **`PENDING_REVIEW`:** Submitted by self-service patient or triage intake; awaiting front-desk identity verification or clinical document review.
- **`SUBMITTED`:** Fully verified and committed intake. Locked against non-administrative modifications. Official registration PDF compiled and available.
- **`REJECTED`:** Marked invalid or duplicate by clinical administration. Requires documented administrative justification in audit log.

---

## 9. Functional Requirements: PDF Generation & Download Subsystem (FR-PDF)

```
┌────────────────────────────────────────────────────────────────────────┐
│             BACKEND WEASYPRINT PDF GENERATION & DELIVERY               │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Engine           │ WeasyPrint (Python, Cairo, Pango) + Jinja2 HTML5 │
│ 2. Styling          │ CSS Paged Media (@page, margins, page X of Y)    │
│ 3. Layout Security  │ Disabled external HTTP fetching (SSRF Protected) │
│ 4. Verification     │ Touchless triage QR Code & Base64 ink signature  │
│ 5. File Delivery    │ Authenticated FastAPI streaming endpoint         │
│                     │ Content-Disposition: attachment; filename=...    │
└────────────────────────────────────────────────────────────────────────┘
```

### 9.1 PDF Generation Technology
* **Authoritative Backend Engine:** WeasyPrint (Python 3.11+ library backed by Cairo and Pango) within FastAPI. Client-side PDF generation is strictly prohibited for official records to ensure clinical data integrity and legal non-repudiation.
* **HTML/CSS Templating:** Document structure defined using Jinja2 templates with CSS3 Paged Media module (`@page`, `@top-right`, `@bottom-center`, `break-inside: avoid`).
* **Non-Blocking Asynchronous Offloading:** WeasyPrint compilation is executed inside worker thread pools (`asyncio.to_thread` or FastAPI `BackgroundTasks`) to prevent blocking the asynchronous ASGI event loop.

### 9.2 PDF Document Content Specification
The generated registration dossier represents an official clinical legal document and contains:

1. **Organization Header & Facility Branding:**
   - Hospital / Clinic Name, Official Medical Facility Logo (embedded as local base64/inline asset).
   - Facility Address, Telephone, Email, and Clinical Licensing Accreditations.
2. **Registration Metadata & Touchless QR Code:**
   - Registration ID (`AEGIS-YYYY-XXXXX`) and Permanent Patient ID (`PID-YYYY-XXXXX`).
   - ISO-8601 Registration Timestamp and Submission Channel (Self-Service or Reception Desk).
   - High-density Touchless Triage QR Code: Encodes a tamper-evident HMAC-SHA256 signed payload containing Registration ID, Patient ID, and check-in token for instant front-desk optical barcode scanning.
3. **Patient Demographics:**
   - Full Name, Date of Birth, Derived Age, Gender, Blood Group, Profile Photo (if provided).
4. **Contact & Residential Information:**
   - Primary Mobile Number, Email Address, Complete Residential Address, City, State, Country, PIN Code.
5. **Emergency Contact Details:**
   - Emergency Contact Name, Relationship, and Verified Emergency Phone Number.
6. **Clinical & Medical Summary:**
   - Existing Medical Conditions, Previous Surgeries, Current Medications, Known Allergies (prominently boxed in red/amber alert borders), and Disability/Accessibility Accommodations.
   - Missing fields explicitly printed as *"Not Provided / Unknown"*.
7. **Insurance & Appointment Details (If Applicable):**
   - Insurance Provider, Policy Number, Policy Holder, Expiry Date.
   - Preferred Doctor, Clinical Department, Reason for Visit, Appointment Date.
8. **Signatures & Medical Legal Declaration:**
   - High-resolution rendering of patient/guardian HTML5 canvas digital ink signature.
   - Date and time of digital signing.
   - Formal statutory consent and privacy disclaimer text.
   - Designated blank placeholder box for Front-Desk Hospital Stamp / Authorized Registrar Physical Seal.

### 9.3 Layout, Typography & Styling Standards
* **Page Dimensions:** Standard ISO A4 (`210mm x 297mm`) with $15\text{mm}$ margins.
* **Header & Footer:** Every page includes running headers with facility name and running footers with pagination: `"Page " counter(page) " of " counter(pages)`.
* **Page Break Hygiene:** Medical and signature sections declare `page-break-inside: avoid` to prevent awkward splits across pages.
* **Dynamic Document Watermarking:** Draft or non-final records feature a diagonal semi-transparent watermark:
  - `"DRAFT - NOT FOR CLINICAL USE"` when status is `DRAFT`.
  - `"PENDING VERIFICATION"` when status is `PENDING_REVIEW`.
  - `"VOID / DEACTIVATED"` when account is deactivated.

### 9.4 Role-Based PDF Download & Secure Delivery
* **Access Control:**
  - Patients can download **only their own** registration PDF (`patient_id == current_user.id`).
  - Receptionists, Assistant Admins (with `pdf:download_all`), and Super Users can download PDFs for any patient.
* **Authenticated Streaming Endpoint:** `GET /api/v1/registrations/{id}/pdf`.
  - Validates caller JWT authorization.
  - Verifies PDF file existence in `/storage/generated_pdfs/{uuid}.pdf`.
  - Verifies file SHA-256 checksum against SQLite record to guarantee tamper-evidence.
  - Streams file as `application/pdf` with header: `Content-Disposition: attachment; filename="Patient_Registration_{reg_id}.pdf"`.
* **Static Access Prevention:** Direct public web access to the PDF storage directory is strictly forbidden.

---

## 10. Non-Functional Requirements: Security, Privacy & Data Protection (NFR-SEC)

### 10.1 Authentication & Credential Security
* **Password Hashing:** Passwords must be hashed using **Argon2id** (memory cost: 64 MB, iterations: 3, parallelism: 4) or **bcrypt** (work factor $\ge 12$). Plaintext passwords must never be logged, cached, or persisted.
* **Session Security:** 15-minute JWT access tokens; 7-day sliding refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
* **Brute-Force Protection:** 5 consecutive failed login attempts within 10 minutes locks the account for 15 minutes and generates a security audit event.

### 10.2 Role-Based Access Control (RBAC) Backend Enforcement
* All authorization checks are executed authoritatively on the **FastAPI backend** using dependency injection (`Depends(get_current_active_user)` and `SecurityScopes`).
* Frontend UI route guards and button states are UX conveniences only. Any backend API call violating role permissions returns HTTP 403 Forbidden.

### 10.3 Protected Health Information (PHI) Data Protection
* **Data in Transit:** All client-server communication must enforce **TLS 1.3** encryption. HTTP requests must automatically redirect to HTTPS with `Strict-Transport-Security` (HSTS) headers.
* **Data at Rest:** SQLite database and document storage volume must reside on encrypted partitions (LUKS on Linux / BitLocker on Windows).
* **Browser Storage Hygiene:** Unencrypted Protected Health Information (PHI) must **never reside permanently in browser `localStorage` or `sessionStorage`**. Client state is maintained in-memory in React component state. Auto-saved drafts are encrypted or set to expire within 48 hours.

### 10.4 Uploaded Document & File Security
* **Magic-Byte MIME Validation:** Validates actual binary file headers. Rejects disguised executables or scripts.
* **UUID Sanitization:** Files are renamed to UUIDv4 strings upon upload to prevent directory traversal (`../../etc/passwd`) or arbitrary code execution.
* **WeasyPrint SSRF Protection:** WeasyPrint is configured with a custom URL fetcher that completely disables external HTTP/HTTPS network fetching. All assets (logos, signatures, QR codes) must be embedded as inline `data:` URIs or loaded from an explicit whitelisted local path.

### 10.5 API Hardening & Middleware
* **CORS Policy:** Whitelists only explicitly configured frontend domains. Wildcard origins (`*`) are strictly prohibited in production.
* **Rate Limiting:** Protects endpoints against denial of service:
  - Auth Endpoints: 5 requests / minute per IP.
  - Document Upload & AI: 10 requests / minute per IP.
  - General Read APIs: 120 requests / minute per IP.
* **Security Headers:** Injects `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

### 10.6 AI Pipeline Security & Non-Diagnostic Boundary
* **Prompt Injection Guardrails:** Extracted text is segregated into isolated XML delimiters. System prompts strictly forbid code execution or directive interpretation.
* **Non-Diagnostic Disclaimer:** The system enforces an administrative-only boundary. All generated screens and PDFs carry the mandatory disclaimer: *"Notice: AI entity extraction is an administrative clerical aid and does not constitute clinical diagnostic advice. All clinical details must be verified by licensed medical personnel."*

### 10.7 Audit Logging & Sanitization
* All security-relevant actions (logins, logouts, registration creations, duplicate overrides, record edits, PDF downloads, permission changes, account deactivations) are committed to an immutable SQLite `audit_events` table.
* **PHI & Credential Sanitization:** Passwords, refresh tokens, complete credit card/banking data, and full medical histories are strictly redacted from audit logs (`"password": "[REDACTED]"`).

### 10.8 Account Deactivation vs. Permanent Deletion Policy
* **HIPAA Record Retention Mandate (45 CFR § 164.312):** Hard deletion of patient records is strictly prohibited.
* Deactivating an account sets `is_active = FALSE`. The user's login access is instantly revoked, existing JWT sessions are invalidated, and all medical records and audit trails remain preserved for clinical and legal requirements. Reactivation can only be executed by a Super User.

---

## 11. Non-Functional Requirements: Error Handling, Reliability & Fault Tolerance (NFR-ERR-REL)

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FAULT TOLERANCE & RECOVERY MODEL                  │
├────────────────────────────────────────────────────────────────────────┤
│ Fault Category        │ System Resilience & Recovery Mechanism         │
├───────────────────────┼────────────────────────────────────────────────┤
│ Corrupted PDF / Image │ Immediate rejection with clear user guidance;  │
│                       │ Form wizard falls back cleanly to manual entry │
├───────────────────────┼────────────────────────────────────────────────┤
│ Groq API Rate Limit   │ Bounded retry with exponential backoff (3x);   │
│ or Cloud Outage       │ Seamless auto-fallback to local regex parser   │
├───────────────────────┼────────────────────────────────────────────────┤
│ SQLite Database Lock  │ Connection pool busy_timeout (5000ms);         │
│                       │ Automatic retry before error surface           │
├───────────────────────┼────────────────────────────────────────────────┤
│ Backend PDF Fail      │ Registration committed safely; PDF marked      │
│                       │ FAILED; Async retry button exposed to staff    │
├───────────────────────┼────────────────────────────────────────────────┤
│ Network Blackout      │ In-memory form state preserved; Toast offline  │
│                       │ banner; Reconnection auto-sync trigger         │
└───────────────────────┴────────────────────────────────────────────────┘
```

### 11.1 Document Processing Fault Tolerance
- **Corrupted / Password-Protected PDFs:** Backend attempts PyMuPDF parsing inside a `try...except fitz.FileDataError` block. If corrupted or encrypted, returns HTTP 422 with actionable guidance: *"Uploaded PDF is password-protected or unreadable. Please upload an unlocked PDF or enter details manually."*
- **Empty / Blank Documents:** If extracted text length $< 20$ characters, notifies the user and provides immediate manual-entry fallback.
- **Partial OCR Extraction:** Populates successfully extracted fields; leaves remaining fields flagged as `"Not Provided"` without aborting the registration.

### 11.2 Groq API Resilience & Circuit Breaker
- **Transient Faults (429 Rate Limits / 503 Outages):** Employs bounded exponential backoff with jitter:
  $$t_{\text{wait}} = 2^n \times 1.0\text{s} \pm \text{jitter}$$
  Maximum 3 attempts.
- **Permanent Errors (401 Invalid Key / 400 Malformed):** Fails fast without retry loops.
- **Circuit Breaker:** If failure rate exceeds 50% over a 10-call rolling window, the circuit breaker opens for 30 seconds, routing all incoming document text directly to the local heuristic regex parser without network latency.
- **Data Preservation:** AI extraction failures **never wipe existing form data**.

### 11.3 Database Concurrency & ACID Integrity
- **Write-Ahead Logging (WAL):** SQLite configured with `PRAGMA journal_mode=WAL;` and `PRAGMA synchronous=NORMAL;` allowing concurrent read operations without blocking writers.
- **Busy Timeout:** Configured with `PRAGMA busy_timeout=5000;` (5 seconds) to handle transient database locks under concurrent write operations.
- **Atomic Transactions:** All registration operations execute within `session.begin_nested()` or atomic transaction blocks. If any step fails, the entire transaction is rolled back (`ROLLBACK`).

### 11.4 PDF Generation Resilience
- **Decoupled Persistence:** A failure in WeasyPrint PDF compilation **never rolls back the committed patient registration in SQLite**.
- Core registration status remains `SUBMITTED`; PDF status is recorded as `FAILED`.
- Front-desk staff or patients can trigger an on-demand regeneration via `POST /api/v1/registrations/{id}/pdf/regenerate` once the service stabilizes.

### 11.5 Network Interruption & Client Resilience
- **Offline Detection:** React listens to `navigator.onLine` events. When offline, renders a persistent banner: *"Network connection lost. Your entered data is preserved locally."*
- **Double-Click Mitigation:** All submission and action buttons disable immediately upon click and display an animated loading spinner to prevent accidental duplicate requests.
- **Safe Error Envelopes:** Backend errors are returned in RFC 7807 problem details format (`{"error": {"code": "...", "message": "..."}}`). Internal SQL queries, raw Python stack traces, and database schemas are strictly stripped from client responses.

### 11.6 System Reliability Targets
- **Target Uptime:** 99.9% availability for core intake and review workflows.
- **Data Loss Rate:** 0% (Zero uncommitted data loss for validated submissions).
- **Mean Time to Recovery (MTTR):** $< 15$ minutes for application container restarts.

---

## 12. Non-Functional Requirements: Performance, Scalability, Usability & Maintainability (NFR-PSUM)

### 12.1 MVP Performance Targets & SLAs
The system enforces the following performance targets under normal operating conditions:

| Operation / Transaction | Target Response SLA | Measurement Criteria |
| :--- | :---: | :--- |
| **Initial SPA Landing Page Load** | **$< 3.0\text{ seconds}$** | First Contentful Paint (FCP) on 4G / broadband network |
| **Standard REST API Responses** | **$< 2.0\text{ seconds}$** | 95th percentile latency across all GET/POST endpoints |
| **User Authentication / Login** | **$< 2.0\text{ seconds}$** | Including Argon2id hashing and JWT issuance |
| **Database Read / Write Operations** | **$< 1.0\text{ second}$** | SQLite queries under active WAL mode |
| **Digital PDF Text Extraction** | **$< 5.0\text{ seconds}$** | PyMuPDF parsing for typical documents ($\le 5\text{ pages}$) |
| **Scanned Document OCR Processing** | **$< 15.0\text{ seconds}$** | Tesseract OCR pre-processing and character recognition |
| **Groq AI Clinical Entity Extraction**| **$< 15.0\text{ seconds}$** | Cloud LLM inference under normal API conditions |
| **Backend WeasyPrint PDF Generation** | **$< 5.0\text{ seconds}$** | Cairo HTML/CSS compilation for 2–3 page intake dossier |

*Note: OCR and AI extraction durations depend on document resolution, page count, and external cloud provider network conditions.*

### 12.2 Scalability & Concurrency Model
* **MVP Concurrency Target:** Optimized for **10 to 20 concurrent users** (front-desk admissions stations and patient self-service portals).
* **SQLite Single-Writer Concurrency:** With SQLite WAL mode, reads proceed concurrently without locking writers. Write transactions are serialized and complete in $< 50\text{ms}$, easily supporting over 100 registrations per hour.
* **Evolutionary Migration Path:** SQLAlchemy 2.0 ORM mappings maintain 100% dialect compatibility with PostgreSQL. Transitioning from SQLite to enterprise PostgreSQL requires updating the connection string in `.env` with zero changes to business logic or router code.

### 12.3 Usability & User Experience Standards
* **Progressive Multi-Step Wizard:** Breaks complex intake into 6 logical steps with clear progress bars and back/next navigation.
* **Responsive Layout:** Tailwind CSS layout adapts seamlessly across mobile phones ($320\text{px}+$), tablets ($768\text{px}+$), and desktop clinical monitors ($1280\text{px}+$).
* **Cognitive Load Reduction:** Form inputs provide contextual placeholder text, helper tooltips, and instant visual validation checkmarks.

### 12.4 Accessibility Requirements (WCAG 2.1 Level AA Compliance)
* **Color Contrast:** All body text and functional UI controls satisfy a minimum contrast ratio of **4.5:1** against backgrounds (and **3:1** for large text/headings).
* **Keyboard Navigation:** Every interactive element (inputs, buttons, modal dismissals, audio controls) is 100% operable via keyboard alone (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`). Focus rings are prominently visible.
* **Screen Reader Semantics:** Comprehensive WAI-ARIA roles, live regions (`aria-live="polite"` for voice status updates), and descriptive input labels (`aria-labelledby`, `aria-describedby`).
* **Dual-Sensory Redundancy:** Color is never used as the sole indicator of state; icons and descriptive text accompany all validation and status badges.

### 12.5 Maintainability & Modular Architecture
* **Decoupled Architecture:** Strict separation between React frontend (presentation, client UX, voice interaction) and FastAPI backend (security, validation, persistence, WeasyPrint compilation).
* **Configuration Management:** All environment variables (database paths, JWT secrets, Groq API keys, port bindings) are loaded through Pydantic `BaseSettings` from `.env`. Secrets are excluded from version control (`.gitignore`).
* **Automated API Documentation:** FastAPI generates schema-accurate, interactive Swagger UI documentation at `/docs` and ReDoc at `/redoc`.
* **Standardized JSON Envelopes:**
  - Success: `{"status": "success", "data": {...}, "meta": {"timestamp": "..."}}`
  - Error: `{"error": {"code": "...", "message": "...", "details": [...]}}`

---

## 13. Role-Based Access Control (RBAC) Matrix

| System Capability / API Resource | 👤 PATIENT | 📋 RECEPTIONIST | 🛠️ ASSISTANT ADMINISTRATOR | 🛡️ SUPER USER | Backend Enforcement Dependency |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Self-Registration (Sign Up)** | **ALLOW** | DENY | DENY | DENY | Public endpoint; assigns `ROLE_PATIENT` |
| **Login / Logout / Token Refresh** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | Validates `is_active == 1` |
| **Change Own Password** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | Requires current password validation |
| **Initiate Password Reset** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | Single-use 15-minute token verification |
| **Upload Own Medical Documents** | **ALLOW** | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Tagged strictly to `own_patient_id` |
| **Upload Other Patients' Documents**| DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Requires scope: `documents:upload_all` |
| **Execute AI OCR & PDF Extraction** | **ALLOW** *(Own)* | **ALLOW** *(Any)* | **CONFIGURABLE** | **ALLOW** | PyMuPDF & Tesseract OCR execution |
| **Voice STT Dictation & TTS Audio** | **ALLOW** | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Browser Web Speech API interfaces |
| **Create Own Registration Intake** | **ALLOW** | DENY | DENY | **ALLOW** | Self-service intake portal |
| **Create Patient Registration (Desk)**| DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Desk intake on patient's behalf |
| **Edit Patient Registration Details**| DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Modify uncommitted intake fields |
| **Review Duplicate Warnings** | DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Access duplicate resolution drawer |
| **View Only Own Patient Details** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | Filtered by `patient_id == user.id` |
| **View All Patients & Queue Roster** | DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Query access across admissions table |
| **Download Own Registration PDF** | **ALLOW** | **ALLOW** | **ALLOW** | **ALLOW** | Stream PDF where `patient_id == user.id` |
| **Download Any Patient's PDF** | DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Requires scope: `pdf:download_all` |
| **Regenerate / Re-compile PDF** | DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Asynchronous WeasyPrint trigger |
| **Transition Status: Draft $\rightarrow$ Submitted**| DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Clinical queue admissions authorization |
| **Reject Patient Registration** | DENY | **ALLOW** | **CONFIGURABLE** | **ALLOW** | Requires documented rejection note |
| **Delete Patient Records** | DENY | DENY | DENY | **DENY\*** | Prohibited under HIPAA retention rules |
| **Create User Accounts** | DENY | DENY | DENY | **ALLOW** | Super User exclusive governance |
| **Manage Patient Accounts** | DENY | DENY | **CONFIGURABLE** | **ALLOW** | Super User or delegated admin |
| **Manage Receptionist Accounts** | DENY | DENY | **CONFIGURABLE** | **ALLOW** | Super User or delegated admin |
| **Create Assistant Administrators** | DENY | DENY | **DENY (Strict)** | **ALLOW** | **Created only by Super User** |
| **Manage Assistant Administrators** | DENY | DENY | **DENY (Strict)** | **ALLOW** | Super User exclusive governance |
| **Modify Assistant Admin Permissions**| DENY | DENY | **DENY (Strict)** | **ALLOW** | Super User exclusive authority |
| **Deactivate User Accounts** | DENY | DENY | **CONFIGURABLE** | **ALLOW** | Soft deactivation (`is_active = 0`) |
| **View System Audit Logs** | DENY | DENY | **CONFIGURABLE** | **ALLOW** | Read access to `audit_events` |
| **Manage Facility & App Settings** | DENY | DENY | DENY | **ALLOW** | Branding, thresholds, configurations |

*\*Note on Deletion: Direct hard deletion is strictly prohibited across all roles. Super Users possess account deactivation authority to satisfy medical audit retention laws.*

---

## 14. Technology Stack, System Constraints & Assumptions

### 14.1 Complete Technology Stack Verification
Every component of the technology stack is verified and allocated a defined architectural role:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VERIFIED TECHNOLOGY STACK                       │
├─────────────────────┬──────────────────┬───────────────────────────────┤
│ Layer / Role        │ Selected Tech    │ Architectural Responsibility  │
├─────────────────────┼──────────────────┼───────────────────────────────┤
│ Frontend Framework  │ React.js 18+     │ Single Page Application UI    │
│ Frontend Styling    │ Tailwind CSS 3+  │ Mobile-first responsive UX    │
│ API Communication   │ Axios            │ HTTP client with interceptors │
│ Backend Microservice│ FastAPI (Python) │ High-speed ASGI REST service  │
│ Relational Database │ SQLite (WAL)     │ ACID persistence layer        │
│ ORM Abstraction     │ SQLAlchemy 2.0   │ Object relational mapping     │
│ Cloud AI Inference  │ Groq API         │ High-throughput LLM entity extraction│
│ PDF Text Extraction │ PyMuPDF (fitz)   │ Backend digital PDF parser    │
│ Client PDF Preview  │ pdfjs-dist       │ Client-side PDF canvas preview│
│ Optical OCR Engine  │ Tesseract OCR    │ Scanned image text recognition│
│ Speech-to-Text      │ Web Speech API   │ In-browser speech dictation   │
│ Text-to-Speech      │ SpeechSynthesis  │ In-browser audio review player│
│ Document PDF Engine │ WeasyPrint       │ Backend CSS Paged Media compiler│
│ Deployment Platform │ Docker & Compose │ Containerized orchestration   │
└─────────────────────┴──────────────────┴───────────────────────────────┘
```

### 14.2 System Constraints
1. **Single-Writer Database Serialization:** SQLite permits concurrent reads but serializes writes. Under write-heavy spikes, the busy timeout is set to 5000ms. If write traffic exceeds 20 concurrent transactions, migration to PostgreSQL via SQLAlchemy is mandated.
2. **WeasyPrint System Dependencies:** WeasyPrint requires native system libraries (`pango`, `cairo`, `gdk-pixbuf`, `libffi`). Deployment containers must install these OS dependencies.
3. **Web Speech API Browser Support:** The Web Speech API is natively supported in Chromium-based browsers (Chrome, Edge) and Safari. In browsers lacking support (e.g., Firefox without experimental flags), the system gracefully degrades by hiding microphone controls while maintaining 100% keyboard input capability.
4. **Groq Cloud API Dependency:** AI extraction relies on external connectivity to Groq endpoints. If disconnected or rate-limited, the system falls back to internal regex/heuristic parsing.

### 14.3 Operational Assumptions
1. Client devices possess modern, evergreen web browsers with JavaScript enabled.
2. Hospital intake stations are equipped with functional audio input/output devices (microphones and speakers) for voice interaction.
3. Network infrastructure maintains sufficient bandwidth for PDF document uploads ($\le 10\text{ MB}$) and HTTPS API communication.

---

## 15. Measurable Acceptance Criteria (AC)

To guarantee software quality and verify implementation readiness, the following measurable acceptance criteria are defined:

### AC-01: Authentication, Session & Multi-Role Authorization
- **Given** an unauthenticated user, **when** they submit valid credentials to `POST /api/v1/auth/login`, **then** the backend returns HTTP 200 with a signed JWT access token (15-min expiry) and sets an `HttpOnly` refresh cookie within $2.0\text{ seconds}$.
- **Given** an authenticated user with role `ROLE_PATIENT`, **when** they attempt to access `GET /api/v1/reception/roster`, **then** FastAPI returns HTTP 403 Forbidden with `"detail": "Insufficient permissions"`.
- **Given** an Assistant Administrator, **when** they attempt to update their own permissions or create another admin account, **then** the backend strictly rejects the request with HTTP 403 Forbidden.
- **Given** a deactivated account (`is_active = 0`), **when** login is attempted, **then** the system returns HTTP 403 Forbidden with a clear administrative contact message.

### AC-02: Patient Registration Form Intake (Manual, PDF, OCR, Voice)
- **Given** the registration form wizard, **when** a valid Date of Birth is selected, **then** the Age field is calculated and displayed automatically with zero manual input.
- **Given** unentered medical condition and allergy fields, **when** the form is submitted, **then** the database stores `"Not Provided"` or `"Unknown"` and never assumes absence of conditions.
- **Given** an uploaded PDF or image file exceeding 10 MB, **when** dropped onto the upload area, **then** the client rejects the file immediately with a visible error toast before network transmission.

### AC-03: AI Document Extraction & Groq Resilience
- **Given** a valid digital medical PDF ($\le 5\text{ pages}$), **when** uploaded, **then** PyMuPDF extracts text and Groq returns structured JSON entity fields within $15.0\text{ seconds}$.
- **Given** an extracted field with confidence score $< 0.70$, **then** the UI highlights that input with an amber warning border and low-confidence indicator.
- **Given** an intentional Groq API outage (simulated 503), **when** a document is uploaded, **then** the system automatically executes the local heuristic parser, populating known regex fields within $2.0\text{ seconds}$ without throwing an unhandled exception.

### AC-04: Voice Interaction Subsystem (STT & TTS)
- **Given** a supported browser with microphone permission granted, **when** the user clicks a field microphone icon and speaks, **then** the spoken words are transcribed and populated into the field in real time.
- **Given** voice recognition failure or silence, **when** speech timeout occurs, **then** previously typed text in the field is 100% preserved.
- **Given** the Form Review screen, **when** the user clicks "Read Form Aloud", **then** `SpeechSynthesis` reads each field sequentially, highlighting the active field card with a high-contrast focus ring.

### AC-05: Multi-Tier Form Validation & Duplicate Detection
- **Given** an invalid phone number (`12345`), **when** the user advances, **then** validation fails with an E.164 formatting error message.
- **Given** a patient registering with a mobile number already existing in SQLite, **when** submitted by a receptionist, **then** the system surfaces the Duplicate Resolution Drawer displaying matching record details and offers Link or Override options.
- **Given** a duplicate override action by staff, **then** the system requires a clinical justification note and logs an `OVERRIDE_DUPLICATE_WARNING` event to `audit_events`.

### AC-06: Submission Lifecycle & SQLite ACID Persistence
- **Given** a complete and validated form, **when** the user clicks "Submit Registration", **then** the client attaches an `X-Idempotency-Key` header and dispatches the payload.
- **Given** rapid double-clicking on the submit button, **then** the button is disabled immediately upon first click and only a single database record is committed.
- **Given** a simulated database failure during submission, **then** the transaction is rolled back, no orphan rows are created, and user-entered form data remains completely intact in the UI.

### AC-07: Backend WeasyPrint PDF Generation & Secure Delivery
- **Given** a successfully submitted registration, **when** WeasyPrint compiles the document, **then** it outputs an A4 multi-page PDF containing facility logo, touchless triage QR code, and base64 signature within $5.0\text{ seconds}$.
- **Given** a patient user requesting `GET /api/v1/registrations/{id}/pdf`, **when** `id` belongs to another patient, **then** the backend returns HTTP 403 Forbidden.
- **Given** a valid PDF download request, **then** the backend streams the file with verified SHA-256 integrity hash and `Content-Disposition: attachment`.

### AC-08: Security, Privacy & Non-Diagnostic Boundary
- **Given** any incoming HTTP request, **then** the backend enforces TLS 1.3 and injects strict security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
- **Given** audit log records in SQLite, **then** no raw passwords, JWT tokens, or unredacted patient medical narratives are visible in log entries.
- **Given** the review screen and generated PDF, **then** both prominently display the statutory non-diagnostic clinical disclaimer.

---

## 16. MVP Feature Scope vs. Future Enhancements

To guarantee rapid delivery of a robust, fully working application within an initial development sprint (24-hour baseline) while planning for long-term scalability, features are strictly categorized into **MVP** and **Future Enhancements**:

### 16.1 24-Hour MVP Baseline Checklist (Mandatory for Initial Working Application)
- [x] **Full Stack Architecture:** Decoupled React.js SPA + Tailwind CSS + Python FastAPI backend.
- [x] **Authentication & RBAC:** Multi-role login (Patient, Receptionist, Assistant Admin, Super User) with JWT access and HttpOnly refresh cookies.
- [x] **Authoritative Backend Guards:** FastAPI dependencies enforcing role and scope boundaries on all endpoints.
- [x] **Patient Registration Form Wizard:** 6-step progressive intake covering Personal, Contact, Emergency, Medical, Insurance, and Appointment sections.
- [x] **Automatic Age Calculation:** Dynamic derivation from Date of Birth with biological sanity bounds.
- [x] **Clinical Tri-State Medical Safety:** Explicit storage and display of `"Not Provided"` / `"Unknown"` for missing medical fields.
- [x] **Document Ingestion:** Drag-and-drop file upload for PDF, PNG, and JPG ($\le 10\text{ MB}$) with magic-byte validation and UUID storage.
- [x] **Backend Text Extraction:** Digital PDF text extraction using PyMuPDF (`fitz`) and image OCR via Tesseract.
- [x] **Client-Side PDF Preview:** Multi-page canvas preview powered by `pdfjs-dist`.
- [x] **AI Entity Extraction:** Groq Cloud API integration for structured JSON parsing with confidence scores and low-confidence amber highlighting.
- [x] **Local Heuristic Fallback:** Offline rule-based regex extraction engine for seamless degradation during AI downtime.
- [x] **Voice Interaction:** Browser-native Web Speech API speech-to-text dictation and SpeechSynthesis read-aloud review with player controls.
- [x] **Live Form Validation:** Client and backend validation for mandatory fields, E.164 phone formats, RFC 5322 emails, and PIN codes.
- [x] **Duplicate Detection:** Automatic checks matching mobile number, email, and composite Name+DOB with non-destructive staff review drawer.
- [x] **Dedicated Review Screen:** Full summary review with inline section edit buttons and HTML5 canvas digital ink signature capture.
- [x] **Transactional Persistence:** SQLite relational persistence with Write-Ahead Logging (WAL) and atomic transaction rollback on failure.
- [x] **Authoritative PDF Generation:** Backend WeasyPrint compilation with Jinja2 HTML5 templates, facility branding, touchless QR code, and base64 signature.
- [x] **Role-Based PDF Streaming:** Authenticated download endpoints streaming PDFs with SHA-256 verification.
- [x] **Soft Account Deactivation:** HIPAA-compliant soft-deletion (`is_active = 0`) preserving patient histories and audit trails.
- [x] **Comprehensive Audit Logging:** SQLite `audit_events` logging for all administrative, auth, and registration actions.
- [x] **Containerization Baseline:** Functional Dockerfile and `docker-compose.yml` for unified application deployment.

### 16.2 Future Enhancements Roadmap (Post-MVP Evolution)
- [ ] **Phase 2.1: Advanced Biometrics & Phonetic Matching**
  - Implement Double Metaphone and Levenshtein distance ($\le 2$) matching for phonetic duplicate detection (e.g., "Jon Smith" vs "John Smyth").
  - Optional facial verification against uploaded profile photo during check-in.
- [ ] **Phase 2.2: Enterprise Relational Scale-Out (PostgreSQL)**
  - Execute automated Alembic migration from SQLite to PostgreSQL with read replicas for high-volume enterprise hospital networks ($> 100$ concurrent registration desks).
- [ ] **Phase 2.3: Offline Queue & IndexedDB Sync (Dexie.js)**
  - Equip the React client with encrypted IndexedDB storage for offline field triage during prolonged network outages, syncing automatically upon reconnection.
- [ ] **Phase 2.4: Cryptographic Audit Hash Chaining (Merkle Tree)**
  - Implement cryptographic hash chaining on `audit_events` (`prev_hash = SHA256(previous_row)`) to mathematically prove log immutability against database tampering.
- [ ] **Phase 2.5: Antivirus ClamAV Daemon Integration**
  - Deploy an asynchronous ClamAV daemon container to scan all uploaded files for embedded PDF exploits or malware before OCR parsing.
- [ ] **Phase 2.6: PDF/A-1b Archival Compliance**
  - Configure WeasyPrint with embedded font subsets and device-independent ICC color profiles for ISO 19005-1 (PDF/A-1b) permanent medical record archiving.
- [ ] **Phase 2.7: Multi-Lingual Internationalization (i18n)**
  - Integrate `react-i18next` and multi-language Groq prompts to support Spanish, French, Hindi, and regional languages for voice and text intake.

---

## 17. Consistency, Quality Review & Risk Analysis

### 17.1 Cross-Section Consistency Verification
During consolidation, all requirements were audited for alignment across workflows:
1. **Role Alignment:** Receptionists are confirmed to have registration creation and editing privileges, but are strictly prohibited from managing user accounts or deleting records across all sections.
2. **Assistant Administrator Governance:** Assistant Administrators are confirmed to be provisioned exclusively by Super Users with immutable self-privilege constraints, preventing privilege escalation.
3. **Medical Safety Consistency:** The mandate requiring `"Not Provided"` or `"Unknown"` defaults for missing medical data is harmonized identically across Form Requirements (Section 5), AI Extraction (Section 6), Validation (Section 8), and PDF Rendering (Section 9).
4. **Duplicate Record Safety:** The non-destructive principle (no automated record overwrites or unverified merges) is strictly synchronized across UI, API, and database specifications.

### 17.2 Technical Risk Analysis & Mitigation Strategies

| Identified Risk | Severity | Architectural Mitigation Strategy |
| :--- | :---: | :--- |
| **SQLite Single-Writer Lock Contention** | Medium | Configured WAL mode (`PRAGMA journal_mode=WAL;`), synchronous=NORMAL, and 5000ms busy timeout. Supported by SQLAlchemy abstraction enabling seamless cutover to PostgreSQL if concurrency targets scale. |
| **Groq Cloud API Outage / Rate Limits** | High | Built-in circuit breaker pattern with exponential backoff and seamless, automatic fallback to local regex/heuristic entity parser. Zero data loss. |
| **Browser Web Speech Incompatibility** | Medium | Feature detection on `window.SpeechRecognition`. Gracefully falls back to manual typing with clear user guidance on unsupported browsers. |
| **WeasyPrint Memory & CPU Utilization** | Medium | Cairo rasterization offloaded to asynchronous background worker thread pool (`asyncio.to_thread`) to prevent blocking FastAPI's ASGI event loop. |
| **Server-Side Request Forgery via PDF** | High | Custom WeasyPrint URL fetcher completely disables external HTTP/HTTPS loading, requiring all assets to be inline Base64 data URIs or verified local paths. |

---

## 18. Document Sign-Off & High-Level Design (HLD) Readiness

### 18.1 Sign-Off Approvals

| Stakeholder Role | Representative Entity | Approval Status | Timestamp |
| :--- | :--- | :---: | :---: |
| **Lead Software Architect** | AI Engineering Architecture Team | **APPROVED** | 2026-10-28 |
| **Clinical Systems Liaison** | Front-Desk Triage & Admissions Board | **CONFIRMED** | 2026-10-28 |
| **Security & Privacy Officer** | InfoSec Compliance & HIPAA Audit Group | **VERIFIED** | 2026-10-28 |
| **UX & Accessibility Specialist**| Universal Healthcare Intake UX Lead | **VERIFIED** | 2026-10-28 |

### 18.2 High-Level Design (HLD) Readiness Confirmation
The requirements outlined in this consolidated document have been rigorously verified, checked for internal consistency, and aligned with all clinical safety and security mandates.

**Formal Confirmation:**  
This Software Requirements Specification (SRS Version 2.0.0) is officially **COMPLETE, CLOSED, and BASELINED**. It is fully prepared and approved to serve as the definitive foundation for the subsequent **High-Level Design (HLD)** phase.

