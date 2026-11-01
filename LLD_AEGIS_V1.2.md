# Low-Level Design (LLD) Specification
## AI-Powered Smart Patient Registration System

**Document Name:** Low-Level Design Specification  
**Project:** AI-Powered Smart Patient Registration System  
**Document Identifier:** LLD-AEGIS-2026  
**Version:** 1.3  
**Date:** October 28, 2026  
**Status:** Master Document Structure – Verified and Baseline-Certified (Ready for Detailed Design)  
**Target Architecture:** Python FastAPI, React.js, SQLite, WeasyPrint, PyMuPDF, Tesseract OCR, Groq API, Docker & Docker Compose  
**Reference Documents:**  
- Approved Software Requirements Specification: [AI_Powered_Smart_Patient_Registration_System_SRS.md](file:///c:/Surya/AI%20Form%20Application/AI_Powered_Smart_Patient_Registration_System_SRS.md)  
- Approved High-Level Design (Version 1.4): [AI_Powered_Smart_Patient_Registration_System_HLD_V1.4.md](file:///c:/Surya/AI%20Form%20Application/AI_Powered_Smart_Patient_Registration_System_HLD_V1.4.md)  

---

## Document Control & Executive Summary

This document establishes the master architectural and engineering blueprint for Phase 1, Task 5: **Low-Level Design (LLD)** of the **AI-Powered Smart Patient Registration System**. 

The purpose of this baseline-certified specification (Version 1.3) is to establish the formal structural framework, module boundaries, data contracts, and detailed design roadmap in strict adherence to the approved Software Requirements Specification (SRS) and High-Level Design (HLD Version 1.4).

In accordance with project development guidelines and approved scope boundaries:
- The structural blueprint has been fully audited against the approved SRS and HLD v1.4, harmonizing confidence indicators, error schemas, entity models, and clinical safety constraints.
- Detailed technical implementations, database DDL schemas, and specific API route specifications are reviewed and approved incrementally.
- No application source code has been generated.
- No existing working application code has been modified.
- No unapproved features or technologies are introduced.

---

## Table of Contents

1. [Section 1: Introduction](#section-1-introduction)
   - 1.1 Purpose of the LLD
   - 1.2 Scope of the Document
   - 1.3 Relationship Between SRS, HLD, and LLD
   - 1.4 Design Principles
   - 1.5 Project Scope and Architecture Constraints
2. [Section 2: Detailed Application Architecture](#section-2-detailed-application-architecture)
   - 2.1 Frontend Architecture
   - 2.2 Backend Architecture
   - 2.3 Database Architecture
   - 2.4 External Service Integration
   - 2.5 Internal Component Communication
   - 2.6 Request and Response Flow
3. [Section 3: Backend Module Design](#section-3-backend-module-design)
   - 3.1 Authentication Module
   - 3.2 User and Role Management Module
   - 3.3 Permission and RBAC Module
   - 3.4 Patient Registration Module
   - 3.5 Document Upload Module
   - 3.6 PDF Text Extraction Module (PyMuPDF)
   - 3.7 OCR Processing Module (Tesseract OCR)
   - 3.8 Groq AI Extraction Module
   - 3.9 Form Validation and Duplicate Detection Module
   - 3.10 Voice Interaction Integration
   - 3.11 PDF Generation Module (WeasyPrint)
   - 3.12 Audit Logging Module
4. [Section 4: Database Design](#section-4-database-design)
   - 4.1 Entity Identification
   - 4.2 Table Relationships
   - 4.3 Primary and Foreign Keys
   - 4.4 Column Definitions
   - 4.5 Constraints and Indexes
   - 4.6 Data Integrity Guarantees
   - 4.7 Transaction Management
5. [Section 5: Authentication and Authorization Design](#section-5-authentication-and-authorization-design)
   - 5.1 Registration and Login Flow
   - 5.2 Password Hashing Architecture
   - 5.3 JWT Authentication Mechanism
   - 5.4 Session Management
   - 5.5 Role-Based Access Control
   - 5.6 Assistant Administrator Permission Governance
   - 5.7 Dynamic Permission Verification (Anti-Stale Token Strategy)
   - 5.8 Permission Revocation Lifecycle
   - 5.9 Backend Authorization Enforcement
6. [Section 6: Patient Registration Design](#section-6-patient-registration-design)
   - 6.1 Seven Approved Registration Sections
   - 6.2 Field-Level Validation Rules
   - 6.3 Missing Medical Information Handling (Universal Safety Rule)
   - 6.4 Manual Data Entry Workflow
   - 6.5 AI-Assisted Field Population
   - 6.6 Human Review and Confirmation Workflow
   - 6.7 Registration Submission Lifecycle
   - 6.8 Duplicate Detection and Resolution Model
7. [Section 7: Document Processing and AI Design](#section-7-document-processing-and-ai-design)
   - 7.1 Supported File Formats
   - 7.2 File Validation and Security Checks
   - 7.3 File Storage and Naming Conventions
   - 7.4 PyMuPDF Extraction Engine
   - 7.5 Tesseract OCR Engine
   - 7.6 Groq Cloud API Integration
   - 7.7 Prompt and Structured Response Schema Design
   - 7.8 Uncertain and Missing Field Handling
   - 7.9 AI Failure and Error Handling
   - 7.10 Mandatory Human Verification
8. [Section 8: Voice Interaction Design](#section-8-voice-interaction-design)
   - 8.1 Browser Web Speech API Integration
   - 8.2 Speech-to-Text (STT) Workflow
   - 8.3 SpeechSynthesis (TTS) Workflow
   - 8.4 User Permission and Browser Capability Handling
   - 8.5 Manual Input Fallback and Data Preservation
   - 8.6 Error Handling and Edge Cases
9. [Section 9: PDF Generation Design](#section-9-pdf-generation-design)
   - 9.1 WeasyPrint Engine Integration
   - 9.2 HTML/CSS Template Structure
   - 9.3 Registration Data Mapping
   - 9.4 PDF Storage and SHA-256 Checksumming
   - 9.5 Secure Download and Streaming Delivery
   - 9.6 Role-Based Access Enforcement
10. [Section 10: API Design](#section-10-api-design)
    - 10.1 API Endpoint Organization
    - 10.2 HTTP Methods and URI Structure
    - 10.3 Request and Response Payload Structures
    - 10.4 Authentication Requirements
    - 10.5 Authorization Requirements and Scopes
    - 10.6 HTTP Status Codes
    - 10.7 Standardized Error Response Format
11. [Section 11: Frontend Design](#section-11-frontend-design)
    - 11.1 React Application Structure
    - 11.2 Page and Component Organization
    - 11.3 Role-Based Dashboards
    - 11.4 Registration Form Design
    - 11.5 Document Upload Interface
    - 11.6 AI Extraction Review Interface
    - 11.7 Voice Interaction Controls
    - 11.8 Client-Side Form Validation
    - 11.9 API Communication Using Axios
12. [Section 12: Security and Error Handling](#section-12-security-and-error-handling)
    - 12.1 Authentication Security
    - 12.2 Authorization Security
    - 12.3 Patient Data Protection (PHI)
    - 12.4 File Upload Security
    - 12.5 API Security and Hardening
    - 12.6 Groq Data Transmission Considerations
    - 12.7 Audit Logging and PHI Redaction
    - 12.8 System Error Handling and Fault Recovery
13. [Section 13: Deployment and Configuration Design](#section-13-deployment-and-configuration-design)
    - 13.1 Docker Containerization Baseline (Approved Core Technology)
    - 13.2 Frontend Container Architecture
    - 13.3 Backend Container Architecture
    - 13.4 Docker Compose Orchestration & Networking
    - 13.5 Persistent Host Storage (Approved Architecture)
    - 13.6 SQLite Startup Configuration & Pragmas (Proposed Details)
    - 13.7 Supporting Dependencies Management
    - 13.8 Deployment Configuration Blueprint
14. [Section 14: Testing and Verification Design](#section-14-testing-and-verification-design)
    - 14.1 Unit Testing Strategy
    - 14.2 API Testing Strategy
    - 14.3 Authentication Testing
    - 14.4 RBAC and Permission Testing
    - 14.5 Registration Validation Testing
    - 14.6 OCR and AI Extraction Testing
    - 14.7 PDF Generation Testing
    - 14.8 Integration Testing Strategy
    - 14.9 End-to-End Testing Strategy
15. [Section 15: Open Technical Decisions](#section-15-open-technical-decisions)
    - 15.1 Password Hashing Configuration
    - 15.2 JWT Access and Refresh Token Strategy
    - 15.3 Database Schema Details
    - 15.4 SQLite Concurrency and PRAGMA Tuning
    - 15.5 File Size Limits and Upload Thresholds
    - 15.6 Unique ID Generation Strategy
    - 15.7 API Endpoint Design and Route Contracts
    - 15.8 Groq Prompt and Structured Response Schema
    - 15.9 Docker Container and Server Configuration
    - 15.10 Supporting Dependencies Formal Confirmation
16. [Section 16: Design Traceability and Approval](#section-16-design-traceability-and-approval)
    - 16.1 SRS-to-LLD Traceability Matrix
    - 16.2 HLD-to-LLD Traceability Matrix
    - 16.3 Design Assumptions and Prerequisites
    - 16.4 Unresolved Questions and Action Items
    - 16.5 Version History
    - 16.6 Document Approval Status

---

## Section 1: Introduction

### 1.1 Purpose of the LLD
This Low-Level Design (LLD) document serves as the implementation-level engineering blueprint for the **AI-Powered Smart Patient Registration System**. It formally translates the clinical and functional requirements established in the approved Software Requirements Specification (SRS) and the architectural structures defined in the approved High-Level Design (HLD Version 1.4) into concrete, component-by-component technical specifications.

The primary objectives of this document are to:
- Establish precise component schemas, internal data structures, interface signatures, and validation algorithms required for construction.
- Provide unambiguous guidelines for backend services, frontend components, persistence logic, and external API integrations without ambiguity or undocumented assumptions.
- Govern implementation fidelity: in accordance with project development methodology, detailed design decisions across each subsystem (such as database schemas, API routes, and dependency choices) are reviewed and approved incrementally prior to code generation.

### 1.2 Scope of the Document
The scope of this document covers the detailed technical design of the entire patient registration lifecycle across twelve core design domains, consistent with the approved SRS and HLD Version 1.4:
- **Backend Service Design:** Construction of modular Python FastAPI APIRouters, service layer handlers, background task execution, and Pydantic validation schemas.
- **Frontend Application Design:** Component tree, view layouts, local state management, and user interaction flows within the React.js (Tailwind CSS) Single Page Application.
- **Database Architecture:** Relational data modeling, table structures, column definitions, constraints, indexes, and session transaction boundaries using SQLite and SQLAlchemy.
- **Authentication & Authorization Design:** Implementation of multi-role login, password hashing, JWT session verification, role-based access control, Assistant Administrator configurable permission governance, and live database scope verification to prevent stale JWT permissions.
- **Patient Registration Subsystem:** Data handling across all seven approved intake sections, dynamic age derivation, field-level validations, duplicate patient detection (Mobile, Email, Name + DOB), and staff resolution drawer logic.
- **Document Ingestion & Processing:** Multipart file validation (magic-byte checking), file sanitization, digital PDF text extraction via PyMuPDF, and scanned document/image optical character recognition via Tesseract OCR.
- **AI-Assisted Entity Extraction:** Secure cloud integration with the Groq API (with specific model selection such as LLaMA 3.3 treated as a proposed decision to be formally confirmed), prompt construction, structured JSON response mapping, confidence scoring, and fallback error handling.
- **Voice Interaction Subsystem:** Client-side integration of the browser's native Web Speech API (`SpeechRecognition`) for speech-to-text dictation and SpeechSynthesis API for audio read-aloud verification.
- **Authoritative PDF Generation:** Backend compilation of publication-grade clinical intake dossiers using WeasyPrint and Jinja2 HTML5 templates, with secure role-based streaming.
- **Security & Data Protection:** Safeguarding Protected Health Information (PHI) at rest and in transit, input sanitization, file upload boundaries, audit logging with PHI redaction, and soft deactivation.
- **Deployment & Containerization:** Multi-container Docker and Docker Compose environment encapsulating the frontend, backend, internal bridge networking, and persistent storage volume mounts.
- **Testing & Quality Assurance:** Test strategies and verification matrices covering unit tests, API tests, RBAC security tests, clinical validation tests, OCR/AI extraction mocks, and end-to-end user workflows.

### 1.3 Relationship Between SRS, HLD, and LLD
The engineering documentation hierarchy follows a structured, traceable progression:
- **Software Requirements Specification (SRS):** Defines **what** the system must do from the perspective of clinical end-users and administrators. It establishes the functional requirements, non-functional requirements, user roles, and clinical safety requirements established in the approved SRS.
- **High-Level Design (HLD Version 1.4):** Defines **where** and **how** major subsystems connect. It decomposes the application into core components, selects the 13 approved technologies, establishes the tiered client-server topology, models component communication protocols, and diagrams major end-to-end workflows.
- **Low-Level Design (LLD):** Defines **how** each individual component will be implemented. It specifies exact data structures, class definitions, function parameters, Pydantic models, SQL schema definitions, error handling routines, and step-by-step algorithms, providing the direct bridge from architecture to source code.

### 1.4 Design Principles
The implementation specifications throughout this document are governed by the following non-negotiable architectural and clinical principles:
1. **Authoritative Backend Governance:** The FastAPI backend serves as the authoritative boundary for all authentication, role-based authorization, clinical validation, and business logic. Client-side React route guards and input masks are UX conveniences only and must never be trusted as security boundaries.
2. **Mandatory Human Verification of AI Extraction:** The Groq AI extraction engine is strictly an administrative clerical aid. AI outputs are provisional and must be verified, corrected (if necessary), and explicitly confirmed by a human user prior to registration submission. AI extraction shall never trigger automated form submission.
3. **No Invention of Missing Patient Information:** The system must never hallucinate, invent, or extrapolate patient demographic or clinical data. Fields that cannot be extracted or are omitted by the user must remain unpopulated or be flagged for manual entry.
4. **Clinical Tri-State Distinction for Medical Information:** Missing medical information must explicitly be stored and rendered as `"Not Provided"` or `"Unknown"`. The system strictly distinguishes between missing information, unknown clinical status, and explicitly confirmed negative medical findings (e.g., No Known Allergies - NKDA). An empty field must never be assumed to indicate the absence of allergies or medical conditions.
5. **Modular Architecture & Single Responsibility:** Components and services must maintain clean separation of concerns, loose coupling, and standardized interface contracts, ensuring that alterations in one module (such as OCR or PDF generation) do not introduce cascading side effects.
6. **Secure Handling of Patient Information & Documents:** Sensitive Protected Health Information (PHI) is safeguarded at rest and in transit through security controls (such as storage volume encryption and secure transport protocols) whose exact implementation mechanisms will be confirmed during detailed design. Raw uploaded files are validated via magic bytes, renamed to UUIDs, and stored outside the web root. Unencrypted PHI must never reside permanently in browser `localStorage`.
7. **Maintainability & Architectural Simplicity:** Implementations must favor readable, maintainable, and standard idiomatic patterns over bespoke or overly complex abstractions. Standard library capabilities and proven patterns must be preferred to ensure high reliability and efficient delivery.

### 1.5 Project Scope and Architecture Constraints
To ensure successful delivery of a robust, fully working application within the approved MVP scope, the design enforces the following constraints:
1. **MVP Scope Priority:** All technical specifications must focus strictly on the core features approved in the SRS and HLD. Out-of-scope enterprise features—such as digital signature pads, QR code generation, triage workflows, local regex-based AI fallback engines, and third-party document previewers—are omitted.
2. **Avoidance of Unnecessary Enterprise Complexity:** The system utilizes an in-process SQLite relational database with Write-Ahead Logging (WAL) and FastAPI asynchronous background tasks, avoiding the operational overhead of external message brokers (e.g., Celery, RabbitMQ), distributed caching systems (e.g., Redis), or microservice meshes.
3. **Strict Technology Stack Adherence:** Implementation decisions must remain 100% consistent with the approved 13 technologies: React.js, Tailwind CSS, Python FastAPI, SQLite, SQLAlchemy, Groq API, PyMuPDF, Tesseract OCR, Web Speech API, SpeechSynthesis API, Axios, WeasyPrint, and Docker/Docker Compose.
4. **Segregation of Proposed Supporting Dependencies:** Supporting tools and specific implementation choices (such as framework/runtime versions like React 18+, build tools like Vite, specific model selections like LLaMA 3.3, test harnesses like Vitest or Playwright, Uvicorn, Nginx, Pydantic, password hashing libraries, and Jinja2) are treated as proposed decisions subject to incremental review and formal confirmation, rather than being introduced as finalized choices.

---

## Section 2: Detailed Application Architecture

### 2.1 Frontend Architecture

#### 2.1.1 Approved Technology Baseline
The frontend Single Page Application (SPA) is constructed using exclusively the approved client-side technologies from the project baseline:
- **React.js:** Declarative component-based user interface framework responsible for application rendering, component lifecycle management, and dynamic view composition.
- **Tailwind CSS:** Utility-first CSS framework providing responsive, accessible styling across mobile, tablet, and desktop viewports.
- **Axios:** Promise-based HTTP client for issuing asynchronous REST API requests to the FastAPI backend and handling response payloads.
- **Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`):** Client-side speech-to-text engine utilizing native browser capabilities for voice dictation directly into form fields without intermediate audio streaming to the backend.
- **Browser SpeechSynthesis API (`window.speechSynthesis`):** Client-side speech synthesis engine providing native audio read-aloud functionality for clinical review and verification.

#### 2.1.2 Frontend Responsibilities and Functional Boundaries
The frontend application executes locally within the end-user's web browser and is responsible for:
1. **Application UI Rendering & Layout:**
   - Rendering accessible, responsive page layouts, modals, navigation headers, and notification banners.
   - Presenting role-appropriate navigation paths, clinical intake flows, and administrative panels.
2. **Seven-Section Patient Registration Wizard:**
   - Guiding the user through the seven approved intake sections strictly adhering to the approved SRS structure:
     1. *Personal Information:* Full Name (alphabetic characters and standard punctuation), Date of Birth (ISO-8601 past date), Age (dynamically calculated from Date of Birth, non-editable), Gender (`Male`, `Female`, `Other`, `Prefer Not to Say`), Blood Group (Optional, defaults to `"Unknown"`), and Profile Photo (Optional image upload supporting JPEG and PNG formats, consistent with Section 7.1).
     2. *Contact Information:* Mobile Number (validated against international E.164 format), Email Address (Optional, validated against standard syntax), Residential Address (House # / Street, City, State, Country), and Postal PIN Code.
     3. *Emergency Contact:* Contact Person Name, Relationship, and Priority Emergency Contact Number.
     4. *Medical Information:* Existing Medical Conditions, Previous Surgeries, Current Medications, and Known Allergies, strictly enforcing the clinical tri-state mandate (`"Not Provided"` or `"Unknown"` stored and rendered for unentered fields; never assuming missing fields indicate negative clinical findings).
     5. *Insurance Information (Optional):* Insurance Provider Name, Policy / Member ID, Policy Holder Name, and Expiration Date.
     6. *Appointment Information (Optional):* Consulting Doctor, Department, Reason for Visit, and Preferred Date/Time.
     7. *System-Generated Information:* Patient ID, Registration ID, Registration Timestamp, and Registration Status (generated and managed authoritatively by the backend system; displayed for completed records).
   - *Registration Summary Review Step:* Prior to final submission, presenting a dedicated summary screen displaying all completed form sections with edit navigation to allow human verification and explicit confirmation before submission.
3. **Role-Appropriate Interfaces:**
   - **Patient Interface:** Self-service registration flow, document upload for extraction, voice dictation/read-aloud review, summary review confirmation, and downloading own finalized registration PDF.
   - **Receptionist Interface:** Assisted patient registration, patient search and record listing, uploading documents on behalf of patients, review and resolution of duplicate detection warnings (via resolution drawer), and viewing/downloading patient registration records.
   - **Assistant Administrator Interface:** Delegated operational dashboard rendering only those features explicitly enabled by Super User permissions. Under the configurable, denied-by-default governance model, the frontend displays only the specific interfaces associated with assigned permissions (e.g., patient records access, PDF downloads, document uploading, or staff account management). The frontend cannot independently grant or escalate permissions.
   - **Super User Interface:** Comprehensive system governance, complete patient record oversight, user account lifecycle management (creation, role assignment, deactivation), granular Assistant Administrator permission configuration, and system audit log inspection.
4. **Document Ingestion & AI Extraction Review Interface:**
   - Providing file selection and drag-and-drop interfaces for patient document uploads (PDF, PNG, JPG, JPEG).
   - Visualizing upload and processing states (uploading, OCR extraction, AI processing).
   - Displaying an interactive pre-fill review panel showing extracted fields alongside visual confidence indicators and provisional badges (without introducing unapproved numerical threshold cutoffs).
   - Enforcing mandatory human verification: allowing the user to inspect, modify, or reject any AI-suggested field prior to committing data into the registration form. AI extraction shall never trigger automated form submission.
5. **Voice Interaction Subsystem Interface:**
   - Providing field-level microphone controls to trigger speech recognition dictation.
   - Providing read-aloud controls to trigger text-to-speech recitation of questions and entered responses for auditory verification.
   - Detecting browser API availability and gracefully displaying fallback messages when speech features are unsupported by the client browser.
6. **Backend Communication via Axios:**
   - Managing asynchronous HTTP communication with the FastAPI backend for authentication, intake data submission, file uploading, duplicate checking, and PDF streaming.

#### 2.1.3 Architectural Boundaries and Responsibility Separation
A strict separation of concerns is maintained between the client-side frontend and the authoritative backend:
1. **User Experience Validation vs. Authoritative Backend Validation:**
   - Frontend validation (e.g., input formatting masks, E.164 phone checks, standard email syntax, required field alerts, and dynamic age calculation) is provided solely for immediate user feedback and user experience enhancement.
   - The frontend is non-authoritative: all business rules, clinical safety constraints, duplicate detection logic, data sanitization, and schema validations are strictly re-evaluated and authoritatively enforced by the FastAPI backend.
2. **Interface Presentation vs. Authoritative Authorization:**
   - Frontend role-based view toggling and route guards are user interface conveniences designed to prevent accidental navigation to inaccessible views.
   - The Super User configures individual Assistant Administrator permissions. The frontend displays only the interfaces associated with assigned permissions, but the frontend cannot grant or escalate permissions.
   - The FastAPI backend independently checks current database-backed permissions on every protected request to prevent unauthorized actions and stale client claims.
3. **Human-in-the-Loop AI Boundary:**
   - The frontend strictly treats AI extraction outputs as provisional clerical suggestions.
   - The frontend must never automatically submit or commit AI-extracted data without explicit user review, manual correction (if needed), and affirmative confirmation.

#### 2.1.4 Proposed Implementation Decisions (Subject to Formal Confirmation)
The following implementation details are identified as proposed technical decisions and remain subject to incremental review and formal confirmation:
1. **React Runtime Version:** Proposed use of React.js 18+ to leverage modern concurrent features and standard lifecycle hooks.
2. **Build Tool & Development Server:** Proposed use of Vite for fast development bundling and production compilation.
3. **State Management Strategy:** Proposed use of React's built-in state management (`useState`, `useContext`) for managing form wizard progression and session context, avoiding external state libraries to maintain architectural simplicity.
4. **Axios Configuration & Interceptors:** Proposed implementation of centralized Axios request interceptors (for Bearer token injection) and response interceptors for standardized error handling.
5. **Token Storage Strategy:** Proposed in-memory token storage (with consideration of secure browser storage mechanisms such as `sessionStorage` or `localStorage`) to be evaluated for security and session persistence trade-offs.
6. **Form Persistence Across Page Refresh:** In-memory React state does not survive a page refresh; persisting form drafts across browser reloads requires an approved browser storage mechanism (e.g., `sessionStorage`), which remains an open proposed decision requiring formal confirmation.
7. **Error Response Schema Parsing:** Proposed translation of backend error responses into user-facing alerts (any claim of RFC 7807 Problem Details compliance remains subject to formal confirmation of whether the backend error schema implements RFC 7807 structures).

### 2.2 Backend Architecture

#### 2.2.1 Approved Technology Baseline
The backend application is implemented using the approved backend technology baseline from the project specification:
- **Python FastAPI:** High-performance, modern ASGI web framework serving as the authoritative core for API routing, request validation, business logic orchestration, and security enforcement.
- **SQLAlchemy:** Object-Relational Mapping (ORM) and SQL toolkit managing relational data abstractions, schema definitions, connection lifecycle, and transactional boundaries.
- **SQLite:** In-process relational database engine providing local ACID-compliant persistence.
- **PyMuPDF (`fitz`):** High-speed document processing library for digital PDF text extraction.
- **Tesseract OCR:** Optical Character Recognition engine for extracting textual content from scanned documents and images.
- **Groq API:** Cloud-hosted high-throughput LLM inference endpoint providing structured entity extraction from extracted document text.
- **WeasyPrint:** Visual rendering engine compiling HTML/CSS templates into authoritative, publication-grade clinical intake PDF dossiers.

#### 2.2.2 Backend Responsibilities and Functional Scope
The FastAPI backend serves as the single authoritative application tier and is responsible for:
1. **Servicing Frontend API Requests:**
   - Exposing RESTful HTTP endpoints consumed by the React/Axios frontend.
   - Parsing, deserializing, and validating incoming JSON payloads and multipart file upload streams.
   - Returning standardized HTTP status codes, structured response envelopes, and informative error payloads.
2. **Authentication and Session Lifecycle:**
   - Managing user credential verification against securely hashed passwords.
   - Generating cryptographically signed JSON Web Tokens (JWT) for authenticated sessions.
   - Enforcing session revocation, token verification, and user active-status checks (`is_active = TRUE`).
3. **Authoritative Role-Based and Configurable Access Control:**
   - Enforcing system-wide Role-Based Access Control (RBAC) across all four approved user roles: Patient, Receptionist, Assistant Administrator, and Super User.
   - Governed by a configurable, denied-by-default permission model for Assistant Administrators, where individual operational scopes are assigned explicitly by the Super User.
   - Dynamically checking live database-backed permissions on protected endpoints for Assistant Administrator requests, ensuring that revocations or permission changes take effect immediately and are not bypassed by stale JWT claims.
4. **Authoritative Data and Clinical Validation:**
   - Re-validating all patient registration data submitted from the frontend, ensuring that client-side validations are never solely relied upon.
   - Enforcing field-level formatting rules, including international phone format (E.164), standard email syntax, past Date of Birth validation, and dynamic age derivation.
   - Strictly enforcing the clinical tri-state mandate across Medical Information (Conditions, Surgeries, Medications, Allergies), guaranteeing that unentered fields are explicitly stored as `"Not Provided"` or `"Unknown"` and never recorded as negative clinical findings.
5. **Patient Registration Lifecycle & Duplicate Detection:**
   - Managing the creation, retrieval, and updating of registration records across all approved sections.
   - Executing duplicate detection checks against existing records using exact matching on Mobile Number, Email Address, and composite Full Name + Date of Birth.
   - Supporting receptionist and administrative duplicate resolution workflows without automated or destructive record merging.
6. **Document Ingestion and Processing Orchestration:**
   - Validating multipart file uploads (file size limits, permitted MIME types, and magic-byte header verification for PDF, PNG, JPG, and JPEG).
   - Sanitizing filenames, assigning unique UUID identifiers, and persisting raw files outside the public web root.
   - Coordinating text extraction: dispatching digital PDFs to PyMuPDF and routing scanned documents or images to Tesseract OCR.
7. **AI Extraction Integration:**
   - Packaging extracted text into structured extraction prompts dispatched to the Groq API.
   - Ingesting Groq LLM responses, parsing structured JSON outputs, mapping extracted data to registration schema fields, and calculating field-level extraction confidence indicators.
   - Ensuring that AI extraction remains strictly a clerical aid: AI outputs are returned as provisional suggestions for human verification and are never automatically committed or submitted to the database.
8. **Authoritative PDF Generation:**
   - Compiling finalized patient intake dossiers into publication-grade clinical PDFs using WeasyPrint.
   - Rendering structured HTML5/CSS print templates populated with verified registration data.
   - Streaming generated PDF binaries over authenticated, role-governed endpoints.
9. **Persistence and Transaction Management:**
   - Managing database connections, session scoping, and transactional boundaries using SQLAlchemy over SQLite.
   - Enforcing atomic commits and rollbacks across all multi-table registration and document operations to maintain data integrity.
10. **Audit Logging & PHI Protection:**
    - Recording append-only audit log entries for all authentication, authorization, registration, document, and administrative events (with tamper-resistance supported through application-level write-only logic and database abort triggers on updates/deletions), ensuring sensitive Protected Health Information (PHI) is masked or redacted.

#### 2.2.3 Layered Architectural Separation
The backend architecture enforces a clean separation of concerns organized into four distinct layers:
1. **API / Router Layer:**
   - Structured into domain-aligned FastAPI `APIRouter` modules (e.g., `auth`, `registrations`, `documents`, `admin`, `users`).
   - Responsible for HTTP request routing, path parameter extraction, query parsing, request payload schema validation, response model serialization, and HTTP exception raising.
   - Utilizes FastAPI's dependency injection system (`Depends`) to bind authentication context, permission guards, and database session lifecycles to individual route handlers.
2. **Business / Service Layer:**
   - Encapsulates all domain-specific business logic, clinical rules, and orchestration workflows entirely independent of HTTP transport mechanisms.
   - Implements specific service classes and functions (e.g., Registration Service, Document Processing Service, AI Extraction Service, PDF Generation Service, Duplicate Detection Service, and User Management Service).
   - Coordinates multi-step operations such as OCR text extraction followed by Groq API prompt invocation, or registration submission paired with audit event generation.
3. **Data Access / Persistence Layer:**
   - Contains SQLAlchemy declarative ORM models representing database tables, column types, relationships, constraints, and indexes.
   - Manages scoped database sessions, query building, transaction lifecycles, and database error handling (such as constraint violations and busy lock states).
   - Isolates database interaction logic from business logic, ensuring straightforward maintainability and clear transaction demarcation.
4. **Supporting Utility and Integration Components:**
   - Reusable cross-cutting helpers and external integration clients.
   - Security utilities: password hashing algorithms, JWT encoding/decoding, and token validation routines.
   - Document utilities: magic-byte file signature validators, secure UUID filename generators, and path sanitizers.
   - External service clients: Groq API client adapter, PyMuPDF extraction wrapper, Tesseract OCR process wrapper, and WeasyPrint compilation helpers.
   - Logging utilities: structured audit event writer with automated PHI redaction filters.

#### 2.2.4 Authoritative Governance and Security Enforcement
1. **Absolute Backend Authority:**
   - Client-side React route guards, input masks, and validation rules exist strictly for user experience and immediate visual feedback.
   - The FastAPI backend serves as the sole authoritative boundary: every incoming payload is re-validated, sanitized, and authorized before any database interaction or business operation occurs.
2. **Dynamic Assistant Administrator Permission Verification:**
   - To guarantee that permission revocations or reconfigurations by the Super User take effect immediately, the backend does not rely solely on permission scopes embedded within JWT claims.
   - For every protected Assistant Administrator request, the authorization dependency inspects the live database-backed permissions (or a synchronized permission version check) associated with the requesting account. If an operational scope is absent or revoked, the request is immediately rejected with HTTP 403 Forbidden.

#### 2.2.5 Proposed Implementation Decisions (Subject to Formal Confirmation)
The following backend implementation details are identified as proposed technical decisions and remain subject to incremental review and formal confirmation:
1. **Python Runtime Version:** Proposed use of Python 3.11+ to benefit from runtime performance enhancements and standard typing features.
2. **ASGI Server Gateway:** Proposed use of Uvicorn as the ASGI web server hosting the FastAPI application inside the backend container.
3. **Data Validation Library:** Proposed use of Pydantic (such as Pydantic v2) for request/response schema modeling, type enforcement, and serialization.
4. **Execution Strategy for Compute-Heavy and I/O Operations:** OCR processing (Tesseract), PDF text extraction (PyMuPDF), document rendering (WeasyPrint), and cloud API calls (Groq) involve blocking CPU or external network operations. The exact execution strategy (e.g., `async def` route handlers offloading blocking tasks via `asyncio.to_thread`, FastAPI `BackgroundTasks`, or a dedicated worker thread pool) remains an open proposed decision to be evaluated and confirmed during detailed backend module design (Section 3).
5. **Password Hashing Library & Algorithm:** Proposed use of Argon2id or bcrypt (subject to Decision 1 in Section 15).
6. **JWT Token Expiration & Refresh Lifespans:** Exact token lifecycles and expiration parameters (subject to Decision 2 in Section 15).
7. **SQLite Session & Connection PRAGMAs:** Connection pooling, WAL mode, busy timeout thresholds, and foreign key enforcement parameters (subject to Decision 4 in Section 15).

### 2.3 Database Architecture

#### 2.3.1 Approved Relational Engine and ORM
- **Approved Relational Database:** SQLite is the sole approved relational database for the application, storing data in an in-process database file persisted on a dedicated Docker host volume (`sqlite_data`, mapped to `/app/data/patient_registration.db`).
- **Approved Object-Relational Mapper (ORM):** SQLAlchemy serves as the data access and mapping layer between the FastAPI application and SQLite, managing declarative data models, query construction, and transactional session lifecycles.

#### 2.3.2 Database Storage Architecture & Concurrency Model
- **File-Backed Persistence:** The SQLite database file resides on a persistent Docker volume (`sqlite_data`), ensuring complete data retention across container restarts and rebuilds.
- **Concurrency & WAL Mode (Proposed):** SQLite operates with an in-process concurrency model. To support multi-user operations without read-write contention, configuring the database in Write-Ahead Logging (WAL) mode (`PRAGMA journal_mode=WAL;`) is proposed (subject to Decision 4 in Section 15), enabling concurrent readers without blocking, while writes are serialized cleanly by SQLite.
- **Busy Timeout & Lock Handling (Proposed):** A busy timeout threshold (`PRAGMA busy_timeout=5000;`) is proposed (subject to Decision 4 in Section 15) to ensure that if a write lock is temporarily held, concurrent write operations wait up to 5,000 milliseconds before raising an operational lock error.
- **Referential Integrity (Proposed):** Foreign key constraint enforcement at connection initialization (`PRAGMA foreign_keys=ON;`) is proposed (subject to Decision 4 in Section 15) to preserve relational integrity across tables.

#### 2.3.3 Session Management and Transaction Demarcation
- **FastAPI Scoped Sessions:** Database sessions are scoped to the lifecycle of individual HTTP requests using FastAPI's dependency injection system (`Depends(get_db)`), ensuring each request receives an isolated SQLAlchemy session that is deterministically closed upon request completion.
- **Unit of Work & Atomic Transactions:** Registration creation, multi-section updates, and document metadata persistence are executed within atomic transaction blocks (`session.begin()`). Transactions are committed only when all operations succeed; unhandled exceptions or constraint violations trigger automatic rollback to prevent partial or corrupted records.
- **Transaction Isolation Boundary:** Long-running or external operations (such as PyMuPDF text parsing, Tesseract OCR rendering, WeasyPrint PDF compilation, and Groq API calls) are strictly excluded from open database write transactions to avoid prolonged database locking.

#### 2.3.4 Proposed Configuration Details (Subject to Confirmation)
The following database configuration choices remain proposed implementation decisions subject to formal confirmation during detailed database design (Section 4):
1. **SQLAlchemy Major Version:** Proposed use of SQLAlchemy 2.0 declarative mapping style and type-annotated models.
2. **Connection Pooling Parameters:** Proposed configuration of `NullPool` or `StaticPool` vs. standard singleton pool appropriate for multi-threaded SQLite access.
3. **Cache and Synchronous Pragmas:** Specific tuning of `PRAGMA synchronous = NORMAL;` and cache size limits under WAL mode.

*[Note: The final database schema, entity definitions, column data types, constraints, and indexes will be designed, reviewed, and approved separately in Section 4 (Database Design).]*

### 2.4 External Service Integration
- **Approved External AI Service:** Groq Cloud API for high-throughput LLM entity extraction from parsed document text.
- **Proposed Integration Details (Subject to Confirmation):**
  - Specific LLM model selection (proposed LLaMA 3.3 models, subject to formal confirmation during detailed design).
  - Transport security configuration (secure HTTPS connection with exact TLS protocol version confirmed during detailed design).
  - Secure credential injection via backend environment variables (`GROQ_API_KEY`).
  - Error resilience and timeout handling: configurable request timeouts, preservation of existing form data, and graceful fallback to manual clerical entry.

*[Status: Pending Detailed Design]*

### 2.5 Internal Component Communication
- Direct in-memory Python calls between FastAPI routers, service classes, and utility modules.
- Scoped SQLAlchemy database sessions managed via FastAPI dependency injection (`Depends(get_db)`).

*[Status: Pending Detailed Design]*

### 2.6 Request and Response Flow
- Step-by-step tracing of incoming HTTP requests from Axios $\rightarrow$ Reverse Proxy $\rightarrow$ FastAPI middleware $\rightarrow$ Security dependency $\rightarrow$ Router handler $\rightarrow$ Service logic $\rightarrow$ SQLAlchemy $\rightarrow$ Response serialization.

*[Status: Pending Detailed Design]*

---

## Section 3: Backend Module Design

This section specifies the detailed internal class structures, function signatures, and responsibilities across the twelve backend modules:

- **3.1 Authentication Module:** User login, password hash verification, JWT token generation, session expiration, and logout.
- **3.2 User and Role Management Module:** User account CRUD operations, profile management, and account deactivation (`is_active = FALSE`).
- **3.3 Permission and RBAC Module:** FastAPI security dependencies, scope verification, and live database permission checking for Assistant Administrators.
- **3.4 Patient Registration Module:** 7-section form ingestion, age calculation, clinical tri-state normalization, and unique ID generation.
- **3.5 Document Upload Module:** Multipart file ingestion, magic-byte header inspection, UUID filename generation, and isolated storage writes.
- **3.6 PDF Text Extraction Module (PyMuPDF):** Vector text and layout block extraction from digital selectable-text PDFs.
- **3.7 OCR Processing Module (Tesseract OCR):** Image preprocessing (grayscale, thresholding via Pillow) and character recognition for scanned records.
- **3.8 Groq AI Extraction Module:** Prompt formatting, Groq API client dispatch, JSON response validation, and confidence score parsing.
- **3.9 Form Validation and Duplicate Detection Module:** Validation execution (E.164, RFC 5322, historical dates) and pre-commit duplicate queries (Mobile, Email, Name+DOB).
- **3.10 Voice Interaction Integration:** Handling incoming standard text fields transcribed client-side via the browser Web Speech API (confirming the backend performs no audio decoding or voice processing).
- **3.11 PDF Generation Module (WeasyPrint):** Jinja2 template rendering, Cairo font shaping, CSS Paged Media compilation, and storage of official A4 dossiers.
- **3.12 Audit Logging Module:** Reliable in-process persistence of security, authorization, and clinical registration events into the `audit_events` SQLite table (committed synchronously within transaction boundaries or managed via reliable in-process execution to ensure audit events cannot be silently lost, without introducing external message brokers or queues), with automated PHI redaction.

*[Status: Pending Detailed Design]*

---

## Section 4: Database Design

*(Note: The final database schema will be designed, reviewed, and approved separately during Phase 1 Task 6.)*

### 4.1 Entity Identification
- Preliminary identification of core relational entities: `User`, `Patient`, `Registration`, `UploadedDocument`, `AuditEvent`, `PermissionScope`, `UserPermission`.

### 4.2 Table Relationships
- Specification of one-to-one, one-to-many, and many-to-many relationships (e.g., User to Registration, User to Permissions, Patient to Registrations).

### 4.3 Primary and Foreign Keys
- Definition of primary key strategies (autoincrementing integers vs UUIDs) and foreign key constraints enforcing relational integrity.

### 4.4 Column Definitions
- Proposed data types (VARCHAR, TEXT, INTEGER, BOOLEAN, DATETIME) mapped to SQLite and SQLAlchemy 2.0 column types.

### 4.5 Constraints and Indexes
- Definition of unique constraints (username, email, mobile), NOT NULL constraints, check constraints, and performance indexes.

### 4.6 Data Integrity Guarantees
- Enforcement of relational consistency, foreign key cascades, and soft deactivation flags.

### 4.7 Transaction Management
- Use of SQLAlchemy context-managed sessions (`session.begin()`) ensuring atomic commits and automatic rollbacks on exceptions.

*[Status: Pending Detailed Design]*

---

## Section 5: Authentication and Authorization Design

### 5.1 Registration and Login Flow
- **Patient Self-Registration (Public Sign-Up):** Unauthenticated users access the public self-registration interface (`POST /api/v1/auth/register`) to create their personal patient account by providing full name, mobile number (E.164), email address, and a secure password. The backend validates credentials, verifies that the mobile and email are not already registered to an existing user, and automatically assigns `ROLE_PATIENT`. Patients are strictly quarantined to their own records and cannot create accounts for other users.
- **Administrative Account Creation (Staff & Admin Provisioning):** Non-patient accounts cannot self-register through the public portal; they must be provisioned administratively:
  - *Receptionist Accounts:* Created, updated, and deactivated solely by the Super User, OR by an Assistant Administrator who has been explicitly assigned the `accounts:receptionist_manage` permission.
  - *Assistant Administrator Accounts:* Created, configured, and deactivated strictly by the Super User. Assistant Administrators cannot create other Assistant Administrators or Super Users.
  - *Super User Account:* Seeded initially during system bootstrap/installation. No user role can create an additional Super User account through standard application workflows.
- **Unified Multi-Role Authentication:** All four roles (Patient, Receptionist, Assistant Administrator, Super User) authenticate through the unified login endpoint (`POST /api/v1/auth/login`) with username/email and password, verifying active account status (`is_active == TRUE`) before issuing session tokens.

### 5.2 Password Hashing Architecture
- Detailed algorithm selection and configuration parameters for Argon2id (`argon2-cffi`) or bcrypt (`passlib`/`bcrypt`).

### 5.3 JWT Authentication Mechanism
- Header, payload claims (`sub`, `role`, `exp`), cryptographic signing algorithm (with HMAC-SHA256 / HS256 proposed pending confirmation, subject to Decision 2 in Section 15), and secret key management.

### 5.4 Session Management
- Token lifespans, header delivery mechanisms, and session termination workflows.

### 5.5 Role-Based Access Control
- Enforcement rules across `ROLE_PATIENT`, `ROLE_RECEPTIONIST`, `ROLE_ASSISTANT_ADMIN`, and `ROLE_SUPER_USER`.

### 5.6 Assistant Administrator Permission Governance
- Explicit mapping of named scopes (`records:view_all`, `accounts:receptionist_manage`, `duplicates:resolve`, etc.) to backend operations.
- Implementation of the "Denied by Default" rule.

### 5.7 Dynamic Permission Verification (Anti-Stale Token Strategy)
- Mechanics of querying the authoritative database on protected endpoints to verify active Assistant Administrator permissions, neutralizing stale JWT privilege retention.

### 5.8 Permission Revocation Lifecycle
- Immediate operational effect when the Super User modifies or revokes an Assistant Administrator's permissions.

### 5.9 Backend Authorization Enforcement
- Construction of reusable FastAPI dependencies combining `Depends(get_current_active_user)` and `SecurityScopes`.

*[Status: Pending Detailed Design]*

---

## Section 6: Patient Registration Design

### 6.1 Seven Approved Registration Sections
- Structural schema and data dictionary for:
  1. Personal Information
  2. Contact Information
  3. Emergency Contact
  4. Medical Information
  5. Insurance Information (Optional)
  6. Appointment Information (Optional)
  7. System-Generated Information

### 6.2 Field-Level Validation Rules
- Exact validation regexes, type bounds, and validation error messages.

### 6.3 Missing Medical Information Handling (Universal Safety Rule)
- Normalization logic ensuring unentered medical fields strictly default to `"Not Provided"` or `"Unknown"`.

### 6.4 Manual Data Entry Workflow
- Keyboard and touch intake specifications across the form wizard.

### 6.5 AI-Assisted Field Population
- Mapping Groq extraction JSON fields into corresponding form sections, enforcing the strict rule that AI extractions must never silently overwrite existing user-entered fields without explicit user confirmation.

### 6.6 Human Review and Confirmation Workflow
- Read-only preview screen specifications, inline edit triggers, and user verification mechanisms.

### 6.7 Registration Submission Lifecycle
- Step-by-step submission execution, idempotency key verification, and status state machine (`DRAFT`, `PENDING_REVIEW`, `SUBMITTED`, `REJECTED` — where `REJECTED` represents an intake marked invalid or duplicate by clinical administration, requiring documented administrative justification in the audit log as specified in SRS Section 8.6).

### 6.8 Duplicate Detection and Resolution Model
- Exact matching logic (Mobile, Email, Name+DOB), authorization rules (`duplicates:resolve`), staff resolution drawer interactions, and audit logging.

*[Status: Pending Detailed Design]*

---

## Section 7: Document Processing and AI Design

### 7.1 Supported File Formats
- **Clinical Medical Documents (Ingestion & AI Extraction Pipeline):** Supported document formats are PDF (`application/pdf`), JPEG (`image/jpeg`), and PNG (`image/png`). These files enter the text extraction (PyMuPDF / Tesseract OCR) and Groq AI entity extraction pipeline to pre-fill registration fields.
- **Profile Photo Uploads (Personal Demographic Asset):** Image files in JPEG (`image/jpeg`) and PNG (`image/png`) formats uploaded as part of Section 1 (Personal Information). These images are stored as patient avatar identification assets and are strictly excluded from document text parsing, OCR, and AI extraction.

### 7.2 File Validation and Security Checks
- Magic-byte verification rules (`%PDF`, `\xFF\xD8\xFF`, `\x89PNG`), file size validation, and malicious extension rejection.

### 7.3 File Storage and Naming Conventions
- UUIDv4 renaming rules, directory organization (`/storage/uploaded_documents/`), and filesystem permissions.

### 7.4 PyMuPDF Extraction Engine
- Python implementation using `fitz` to parse text streams, layout blocks, and page boundaries.

### 7.5 Tesseract OCR Engine
- Image preprocessing pipeline using Pillow and execution of character recognition for non-text files.

### 7.6 Groq Cloud API Integration
- Asynchronous client integration, API key handling, endpoint configuration, and network timeouts.

### 7.7 Prompt and Structured Response Schema Design
- System prompt construction, untrusted document text delimiting (`<clinical_document_text>`), and expected JSON response schema.

### 7.8 Uncertain and Missing Field Handling
- Qualitative visual confidence indicators, provisional field tagging, and visual review flagging in UI without unapproved numerical cutoff thresholds.

### 7.9 AI Failure and Error Handling
- Timeout and error recovery: friendly notifications, preservation of form data, and manual entry fallback.

### 7.10 Mandatory Human Verification
- Architectural enforcement ensuring AI outputs are strictly reviewable and require manual user confirmation prior to submission; existing manually entered user data is strictly protected against automated overwriting.

*[Status: Pending Detailed Design]*

---

## Section 8: Voice Interaction Design

### 8.1 Browser Web Speech API Integration
- Client-side event listeners on `window.SpeechRecognition` / `webkitSpeechRecognition`.

### 8.2 Speech-to-Text (STT) Workflow
- User-initiated microphone toggle, listening state visualization, real-time field transcription, and keyboard editing.

### 8.3 SpeechSynthesis (TTS) Workflow
- User-initiated audio review, playback controls (Play, Pause, Resume, Stop), speed adjustments ($0.75\times$ to $1.25\times$), and visual focus highlighting.

### 8.4 User Permission and Browser Capability Handling
- Microphone permission denial handling, browser capability detection, and fallback to manual typing.

### 8.5 Manual Input Fallback and Data Preservation
- Strict rule guaranteeing that speech recognition failures or timeouts never clear or overwrite existing field data.

### 8.6 Error Handling and Edge Cases
- Handling background noise, microphone disconnection, and network interruptions during speech recognition.

*[Status: Pending Detailed Design]*

---

## Section 9: PDF Generation Design

### 9.1 WeasyPrint Engine Integration
- Backend integration of `weasyprint.HTML` for PDF document compilation (with execution strategy, such as worker threads or thread pool executor, maintained as an open proposed decision to be confirmed during detailed design).

### 9.2 HTML/CSS Template Structure
- Jinja2 HTML5 template layout, CSS3 Paged Media rules (`@page`, running headers, footers with page numbering, break hygiene).

### 9.3 Registration Data Mapping
- Mapping confirmed registration records, organization branding, clinical data (with `"Not Provided"` defaults), and the designated blank placeholder box for the front-desk hospital stamp / authorized registrar physical seal (approved requirement as specified in SRS Section 9.1 and HLD v1.4 Section 3.10).

### 9.4 PDF Storage and SHA-256 Checksumming
- File writing to `/storage/generated_pdfs/{uuid}.pdf`, generation of SHA-256 binary hash, and database metadata logging.

### 9.5 Secure Download and Streaming Delivery
- Authenticated FastAPI streaming endpoint (`GET /api/v1/registrations/{id}/pdf`) with `Content-Disposition: attachment`.

### 9.6 Role-Based Access Enforcement
- Enforcement verifying Patients download only their own PDF, while Receptionists, authorized Assistant Admins, and Super Users can download all dossiers.

*[Status: Pending Detailed Design]*

---

## Section 10: API Design

*(Note: The complete, final API endpoint specification will be detailed in a dedicated API Design task.)*

### 10.1 API Endpoint Organization
- Domain router partitioning: `/api/v1/auth`, `/api/v1/users`, `/api/v1/registrations`, `/api/v1/documents`, `/api/v1/admin`.

### 10.2 HTTP Methods and URI Structure
- RESTful conventions (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) with predictable plural resource naming.

### 10.3 Request and Response Payload Structures
- Pydantic schema validation for request bodies and standardized success envelopes (`{"status": "success", "data": {...}}`).

### 10.4 Authentication Requirements
- Bearer token authentication via HTTP `Authorization` header.

### 10.5 Authorization Requirements and Scopes
- Mapping endpoints to specific RBAC roles and configurable scope strings.

### 10.6 HTTP Status Codes
- Standard semantic codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Error, 502/504 Gateway Error.

### 10.7 Standardized Error Response Format
- Specification of a uniform application error envelope (e.g., `{"error": {"code": "...", "message": "...", "details": [...]}}`), with potential alignment to standard RFC 7807 Problem Details format to be formally evaluated and confirmed during detailed API design.

*[Status: Pending Detailed Design]*

---

## Section 11: Frontend Design

### 11.1 React Application Structure
- Directory hierarchy: `/src/components`, `/src/pages`, `/src/services`, `/src/context`, `/src/hooks`, `/src/utils`.

### 11.2 Page and Component Organization
- Layout shells, shared UI components, navigation bars, and modal containers.

### 11.3 Role-Based Dashboards
- Specific portal views: Patient Portal, Reception Desk, Admin Workspace, Super User Console.

### 11.4 Registration Form Design
- Progressive multi-step wizard preserving all seven approved sections with progress indicators.

### 11.5 Document Upload Interface
- Drag-and-drop file upload zone, file validation feedback, and upload progress indicators.

### 11.6 AI Extraction Review Interface
- Visual confidence indicators, provisional field highlighting, and side-by-side verification view without unapproved numerical threshold cutoffs.

### 11.7 Voice Interaction Controls
- Inline microphone buttons, active listening indicators, and audio playback control bar for form review.

### 11.8 Client-Side Form Validation
- Real-time field validation, error tooltips, and tab error badges.

### 11.9 API Communication Using Axios
- Centralized Axios service with base URL configuration, request interceptors, and error handlers.

*[Status: Pending Detailed Design]*

---

## Section 12: Security and Error Handling

### 12.1 Authentication Security
- Salted password hashing (Argon2id/bcrypt), brute-force throttling, and token expiry.

### 12.2 Authorization Security
- Server-side dependency enforcement and anti-stale dynamic permission checking for Assistant Administrators.

### 12.3 Patient Data Protection (PHI)
- Zero-trust in-memory client state; no unencrypted PHI stored permanently in browser `localStorage`. In-transit encryption over HTTPS.

### 12.4 File Upload Security
- Magic-byte MIME validation, UUID file renaming, directory traversal prevention, and non-executable storage permissions.

### 12.5 API Security and Hardening
- CORS domain whitelisting, rate limiting on sensitive endpoints, and security headers.

### 12.6 Groq Data Transmission Considerations
- Delimited prompts, secure HTTPS transport encryption (with specific TLS protocol configuration confirmed during detailed design), and administrative-only non-diagnostic disclaimers.

### 12.7 Audit Logging and PHI Redaction
- Append-only event recording in SQLite (with tamper-resistance supported through application-level write-only logic and database abort triggers on UPDATE/DELETE) and automated redaction of passwords, tokens, and sensitive medical narratives.

### 12.8 System Error Handling and Fault Recovery
- Centralized exception handlers, safe error envelopes (no internal stack traces exposed to clients), and database transaction rollback guarantees.

*[Status: Pending Detailed Design]*

---

## Section 13: Deployment and Configuration Design

### 13.1 Docker Containerization Baseline (Approved Core Technology)
- Containerization using Docker and Docker Compose (approved technology #13).
- Multi-container topology encapsulating the frontend application, FastAPI backend application, and persistent host storage mounts.

### 13.2 Frontend Container Architecture
- **Approved Scope:** Containerized delivery of the production React Single Page Application (Tailwind CSS bundle).
- **Proposed Supporting Details (Subject to Confirmation):** Lightweight Nginx Alpine web server serving static production assets and reverse-proxying API calls (`/api/v1/`) to the backend container.

### 13.3 Backend Container Architecture
- **Approved Scope:** Containerized delivery of the Python FastAPI application with necessary system binaries for PyMuPDF, Tesseract OCR, and WeasyPrint rendering (Cairo and Pango libraries).
- **Proposed Supporting Details (Subject to Confirmation):** Python 3.11-slim base image running FastAPI through the Uvicorn ASGI server gateway.

### 13.4 Docker Compose Orchestration & Networking
- **Approved Scope:** Unified multi-service deployment defined in `docker-compose.yml`.
- **Proposed Configuration Details (Subject to Confirmation):** Internal bridge network definition (`aegis-net`), port bindings (e.g., ports 80/443), and container health check probes (`/healthz`).

### 13.5 Persistent Host Storage (Approved Architecture)
- Dedicated persistent host volume mounts ensuring state persistence:
  - `sqlite_data` (mounted to `/app/data/` for the SQLite database file).
  - `uploaded_docs` (mounted to `/app/storage/uploaded_documents/` for raw medical uploads).
  - `generated_pdfs` (mounted to `/app/storage/generated_pdfs/` for WeasyPrint output dossiers).

### 13.6 SQLite Startup Configuration & Pragmas (Proposed Details)
- Proposed runtime pragmas executed at database connection initialization: `PRAGMA journal_mode=WAL;`, `PRAGMA busy_timeout=5000;`, and `PRAGMA foreign_keys=ON;` (subject to Decision 4 in Section 15).

### 13.7 Supporting Dependencies Management
- Formal package manifest management via `requirements.txt` (Python backend) and `package.json` (Node.js/React frontend).

### 13.8 Deployment Configuration Blueprint
- Container startup scripts, health check probes (`/healthz`), environment variable injection (`.env`), and runtime directory initialization.

*[Status: Pending Detailed Design]*

---

## Section 14: Testing and Verification Design

### 14.1 Unit Testing Strategy
- Pytest for backend utility functions and validation schemas; Vitest/React Testing Library for frontend components.

### 14.2 API Testing Strategy
- Automated HTTP testing using FastAPI `TestClient` across all endpoints.

### 14.3 Authentication Testing
- Test suites verifying login, invalid passwords, token expiration, and deactivated account rejection.

### 14.4 RBAC and Permission Testing
- Matrix-based tests verifying role isolation, Assistant Admin configurable scopes, and self-escalation blocks.

### 14.5 Registration Validation Testing
- Validation test cases for mandatory fields, E.164 phones, RFC 5322 emails, historical DOBs, and `"Not Provided"` medical defaults.

### 14.6 OCR and AI Extraction Testing
- Mock testing for PyMuPDF parsing, Tesseract OCR character recognition, and Groq API structured JSON extraction.

### 14.7 PDF Generation Testing
- Visual and structural verification of WeasyPrint A4 PDF compilation and SHA-256 checksumming.

### 14.8 Integration Testing Strategy
- End-to-end testing of multipart upload $\rightarrow$ extraction $\rightarrow$ form review $\rightarrow$ SQLite commit $\rightarrow$ PDF download.

### 14.9 End-to-End Testing Strategy
- Playwright or Cypress workflows validating user journeys across all four roles.

*[Status: Pending Detailed Design]*

---

## Section 15: Open Technical Decisions

The following implementation-specific decisions are explicitly documented for discussion and confirmation during detailed LLD design:

```
┌────────────────────────────────────────────────────────────────────────┐
│            OPEN TECHNICAL DECISIONS REQUIRING LLD CONFIRMATION         │
├─────────────────────┬──────────────────────────┬───────────────────────┤
│ Decision Area       │ Proposed Implementation  │ LLD Decision Scope    │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 1. Password Hashing │ `argon2-cffi` vs         │ Confirm hashing choice│
│    Configuration    │ `passlib[bcrypt]`        │ and salt parameters   │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 2. JWT Access and   │ 15-minute access token;  │ Confirm token lifespan│
│    Refresh Strategy │ 7-day refresh token      │ and delivery mechanism│
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 3. Database Schema  │ SQLAlchemy 2.0 models    │ Finalize column types,│
│    Details          │ with foreign keys        │ constraints & indexes │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 4. SQLite PRAGMA    │ journal_mode=WAL;        │ Confirm SQLite I/O &  │
│    Tuning           │ busy_timeout=5000;       │ concurrency pragmas   │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 5. File Size Limits │ 10 MB per file upload    │ Confirm per-document  │
│                     │                          │ size ceiling          │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 6. Unique ID        │ Patient: PID-YYYY-XXXXX  │ Confirm ID string     │
│    Generation       │ Reg: AEGIS-YYYY-XXXXX    │ generation format     │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 7. API Endpoint     │ RESTful /api/v1/ routes  │ Finalize exact route  │
│    Design           │ with RFC 7807 errors     │ contracts & payloads  │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 8. Groq Prompt and  │ Structured JSON schema   │ Finalize system prompt│
│    Response Schema  │ with confidence scores   │ and delimiter tags    │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 9. Docker Server    │ Nginx (Frontend static)  │ Confirm reverse proxy │
│    Configuration    │ Uvicorn (Backend ASGI)   │ and ASGI parameters   │
├─────────────────────┼──────────────────────────┼───────────────────────┤
│ 10. Supporting      │ Pydantic, python-jose,   │ Formally confirm the  │
│     Dependencies    │ python-multipart, jinja2,│ supporting Python     │
│                     │ Pillow (PIL)             │ packages for backend  │
└─────────────────────┴──────────────────────────┴───────────────────────┘
```

---

## Section 16: Design Traceability and Approval

### 16.1 SRS-to-LLD Traceability Matrix

| SRS Requirement Category | Key Functional Scope | Authoritative LLD Implementation Section |
| :--- | :--- | :--- |
| **FR-AUTH** (Authentication & Session Management) | Multi-role login, JWT issuance, session termination, password reset, account status | Section 5 (Auth & Authorization) & Section 3.1 |
| **FR-REG** (Patient Registration Form Subsystem) | 7-section form intake, dynamic age calculation, clinical tri-state defaults | Section 6.1–6.4 & Section 3.4 |
| **FR-DOC-AI** (Document Upload & AI Extraction) | Multipart upload, magic bytes, PyMuPDF, Tesseract OCR, Groq AI entity extraction | Section 7 & Section 3.5–3.8 |
| **FR-VOICE** (Voice Interaction Subsystem) | Client-side Speech-to-Text dictation and SpeechSynthesis read-aloud verification | Section 8 & Section 11.7, 3.10 |
| **FR-VAL-SUB** (Validation, Duplicate & Submit) | Authoritative backend validation, duplicate detection (Phone/Email/Name+DOB), resolution | Section 6.2, 6.7, 6.8 & Section 3.9 |
| **FR-PDF** (PDF Generation & Role Download) | WeasyPrint clinical intake dossier compilation, hospital stamp placeholder, role streaming | Section 9 & Section 3.11 |
| **NFR-SEC** (Security & PHI Protection) | Role-based access control, Assistant Admin anti-stale database check, PHI shielding | Section 5 (5.5–5.9), Section 12 |
| **NFR-ERR-REL** (Error Handling & Reliability) | Safe error envelopes, manual entry fallbacks, SQLite ACID transactions, idempotency | Section 7.9, Section 12.8, Section 4.7 |
| **NFR-PSUM** (Performance & Maintainability) | Responsive layouts, lightweight state management, modular separation of concerns | Section 1.4, Section 2.1, 2.2, 13, 14 |
| **RBAC-GOV** (Role & Permission Governance) | Four distinct roles, denied-by-default Assistant Admin permissions, Super User administration | Section 5.5–5.9 & Section 3.2, 3.3 |

### 16.2 HLD-to-LLD Traceability Matrix

| HLD Component ID & Name | Architectural Role in HLD v1.4 | Mapped LLD Specification Section |
| :--- | :--- | :--- |
| **C-01: React Frontend SPA** | Client UI rendering, 7-step wizard, voice controls, review screen | Section 2.1 & Section 11 |
| **C-02: FastAPI Backend Core** | Authoritative API gateway, router endpoints, validation boundary | Section 2.2 & Section 3, Section 10 |
| **C-03: Authentication & RBAC** | Password hashing, JWT issuance, dynamic live DB permission check | Section 5 & Modules 3.1, 3.2, 3.3 |
| **C-04: Patient Registration Module**| Ingestion of 7 intake sections, tri-state clinical normalization, status state machine | Section 6 & Module 3.4 |
| **C-05: Document Upload Module** | Multipart file validation, magic-byte checking, UUID storage outside web root | Section 7.1–7.3 & Module 3.5 |
| **C-06: Document Text Processing** | Digital PDF vector extraction (PyMuPDF) and scanned image OCR (Tesseract) | Section 7.4, 7.5 & Modules 3.6, 3.7 |
| **C-07: AI Extraction Module** | Groq Cloud API structured JSON extraction, confidence indicators, manual fallback | Section 7.6–7.10 & Module 3.8 |
| **C-08: Form Validation & Duplicates**| Authoritative E.164/email validation, duplicate detection, staff resolution drawer | Section 6.2, 6.8 & Module 3.9 |
| **C-09: Voice Interaction Subsystem**| Browser Web Speech API (STT) and SpeechSynthesis API (TTS) | Section 8 & Module 3.10, Section 11.7 |
| **C-10: PDF Generation Module** | WeasyPrint compilation, Jinja2 template, hospital stamp placeholder box | Section 9 & Module 3.11 |
| **C-11: Database Persistence Layer**| SQLite file persistence, WAL mode, SQLAlchemy models, transactional integrity | Section 2.3, Section 4 & Section 13.5, 13.6 |
| **C-12: Audit Logging & Security** | Append-only audit events with PHI redaction, security headers, rate limiting | Section 12 & Module 3.12 |

### 16.3 Design Assumptions and Prerequisites
- Availability of modern web browsers supporting ECMAScript 2020+ and the W3C Web Speech API.
- Python 3.11+ execution environment with necessary system libraries (Cairo, Pango, Tesseract-OCR) available inside containers.
- Valid Groq Cloud API access credentials for external AI extraction.

### 16.4 Unresolved Questions and Action Items
- Review and confirmation of the ten open technical decisions in Section 15.
- Formal sign-off on the LLD master structure prior to detailing individual schemas and endpoints.

### 16.5 Version History

| Version | Date | Description of Changes | Author / Reviewer |
| :--- | :--- | :--- | :--- |
| **1.0** | 2026-10-28 | Initial LLD master document structure established across all 16 required sections, aligned strictly with SRS and HLD V1.4. Detailed technical sections marked as Pending Detailed Design. | AI Systems Architecture Team |
| **1.1** | 2026-10-28 | Executed Batch 1 & 2 audit corrections: removed numerical confidence thresholds (< 0.70) in favor of visual indicators; qualified WeasyPrint execution strategy as an open proposed decision; clarified error envelope and RFC 7807 evaluation; harmonized 7-section names with SRS; added protection against AI overwriting manual entries; added UploadedDocument to entity list; clarified backend voice scope as standard text ingestion; and specified SQLite audit append-only trigger enforcement. | AI Systems Architecture Team |
| **1.2** | 2026-10-28 | Completed final consistency review: expanded Section 2.3 database architecture without schema DDL; clarified patient self-registration vs. administrative provisioning in Section 5.1; verified REJECTED status (SRS Section 8.6); differentiated profile-photo uploads from medical document processing in Section 7.1; verified hospital stamp/seal placeholder in Section 9.3; distinguished approved containerization from proposed deployment configurations in Section 13; and populated explicit bidirectional traceability matrices in Section 16.1 and 16.2. | AI Systems Architecture Team |
| **1.3** | 2026-10-28 | Completed final targeted consistency corrections: fixed Section 13 TOC numbering and verified all body subsections; updated SQLite PRAGMA decision reference in Section 2.2.5 to Decision 4; harmonized Sections 2.3.2 and 13.6 for proposed SQLite PRAGMAs; marked HS256 as proposed in Section 5.3; reframed audit log immutability to application-level write-only logic and abort triggers in Sections 2.2.2 and 12.7; clarified reliable in-process audit persistence without message brokers in Section 3.12; confirmed SRS explicit support for idempotency keys and REJECTED justification; and harmonized Groq transport security to proposed HTTPS configuration in Section 12.6. | AI Systems Architecture Team |

### 16.6 Document Approval Status
- **Current Status:** **Master Document Structure – Verified and Baseline-Certified (Ready for Detailed Design)**
- *Boundary:* This document establishes the structural blueprint only. Detailed database schemas, API specifications, and application code development remain frozen pending user review and authorization.

