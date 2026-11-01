# AegisMed - AI-Powered Smart Patient Registration System

A next-generation, healthcare-grade patient registration intake platform featuring **automated document parsing (PDF & OCR)**, **conversational speech-to-text intake**, **text-to-speech verification read-out**, and **structured clinical PDF dossier generation**.

---

## 📚 System Documentation & Specifications

- **Software Requirements Specification (SRS):** [SRS.md](file:///c:/Surya/AI%20Form%20Application/SRS.md) — Comprehensive IEEE 830-compliant specification covering Authentication, Account Management, FastAPI security dependencies, SQLite persistence, and Role-Based Access Control (RBAC).

---

## 👥 Role-Based Access Control (RBAC)

The application enforces role-based access control with four distinct user roles:

| Capability / Feature | 👤 Patient | 📋 Receptionist | 🛠️ Assistant Admin | 🛡️ Super User |
| :--- | :---: | :---: | :---: | :---: |
| **Independent Self-Registration** | ✅ | ✅ | ⚙️ Configurable | ✅ |
| **Register on Patient's Behalf** | ❌ | ✅ | ⚙️ Configurable | ✅ |
| **Upload Documents (PDF / Scans)** | ✅ *(Own)* | ✅ *(Any)* | ⚙️ Configurable | ✅ |
| **AI OCR & Entity Extraction** | ✅ | ✅ | ⚙️ Configurable | ✅ |
| **Voice Speech-to-Text Dictation** | ✅ | ✅ | ⚙️ Configurable | ✅ |
| **Text-to-Speech Verification Readout** | ✅ | ✅ | ⚙️ Configurable | ✅ |
| **Download Own Registration PDF** | ✅ | ✅ | ✅ | ✅ |
| **View Own Registration Only** | ✅ | ❌ *(Views All)* | ⚙️ Configurable | ❌ *(Views All)* |
| **Search & View All Hospital Admissions** | ❌ | ✅ | ⚙️ Configurable | ✅ |
| **Edit Registered Patient Details** | ❌ | ✅ | ⚙️ Configurable | ✅ |
| **Delete Registration Records** | ❌ | ❌ | ❌ | ✅ |
| **Create Receptionist Accounts** | ❌ | ❌ | ⚙️ Configurable | ✅ |
| **Manage Patient Accounts** | ❌ | ❌ | ⚙️ Configurable | ✅ |
| **Create / Manage Assistant Admins** | ❌ | ❌ | ❌ *(Strict)* | ✅ |
| **Assign Assistant Admin Permissions** | ❌ | ❌ | ❌ *(Strict)* | ✅ |
| **Deactivate User Accounts** | ❌ | ❌ | ⚙️ Configurable | ✅ |
| **Monitor Real-Time Activity Audit Logs** | ❌ | ❌ | ⚙️ Configurable | ✅ |
| **Administrative Settings & System Dashboard** | ❌ | ❌ | ❌ | ✅ |

### Primary Role Profiles
1. **Super User**: Complete administrative access across all patient registrations, user accounts, Assistant Admin permissions, audit logs, and system settings.
2. **Assistant Administrator**: Created exclusively by Super User; receives individually configurable permissions; cannot escalate rights or create other administrators.
3. **Receptionist**: Full view and search across all patient admissions, creates new registrations on behalf of patients, processes documents with AI OCR, edits intake details; cannot manage accounts or delete records.
4. **Patient**: Registers independently, uploads personal documents, dictates missing details with voice, verifies with TTS, and views/downloads only their own registration dossier.

---

## 🌟 Key Capabilities & Features

### 1. Multi-Modal Patient Registration Intake
- **Manual Form Entry**: Comprehensive 6-step medical intake workflow (Demographics, Contact & Emergency, Insurance & Billing, Clinical Details & Allergies, Visit & Vitals, Review & Audio Verification).
- **Targeted Field Dictation**: Every single field features an inline microphone button for instant, hands-free speech dictation.
- **Auto-Calculations**: Dynamic Age from DOB, auto-calculated Body Mass Index (BMI) with physiological health category badges (Underweight, Normal, Overweight, Obese).

### 2. Medical Document Upload, PDF Parsing & AI OCR
- **PDF Text Extraction**: Parses digital PDF records using `pdfjs-dist` to reconstruct lines, key-value mappings, and clinical tables.
- **Scanned Document OCR**: Uses `tesseract.js` to render scanned document pages and image files (PNG, JPG, TIFF) to canvas and extract text.
- **Intelligent Clinical Entity Extractor**: Heuristic medical NLP engine extracting:
  - Full Name, DOB, Age, Gender, Blood Group, Marital Status
  - Phone, Email, Residential Address, City, State, Zip
  - Emergency Contact Person, Relationship, Emergency Phone
  - Health Insurance Carrier, Policy/Member ID, Group #
  - Documented Allergies with reaction and severity grading (Mild, Moderate, Severe)
  - Chronic Conditions (Hypertension, Diabetes, Asthma, CAD, etc.)
  - Active Medications, Strengths, and Frequencies
  - Consulting Department, Physician, Chief Complaint, Duration
  - Vitals (BP, Pulse, Temp, SpO2, Height, Weight, BMI)
- **Visual AI Extraction Drawer**: Review extracted values alongside confidence scoring badges (High, Medium, Low) with selective field population.
- **Pre-Loaded Sample Medical Records**: 4 clinical records (Discharge Summary & Prescription, Orthopedic Intake, Diagnostic Lab Slip, Pediatric Record) for instant 1-click testing.

### 3. Voice Input (Speech-to-Text)
- **Continuous Freeform Voice Intake**: Speak freely in natural language; the system streams words in real-time, extracts clinical entities on the fly, and populates fields.
- **Guided Step-by-Step Voice Interview**: System speaks questions ("What is your full name?", "Do you have any drug allergies?") and records spoken answers.
- **Pre-Recorded Voice Sample Simulations**: Test voice workflows immediately even without microphone hardware or in restricted environments.

### 4. Text-to-Speech (TTS) Verification Read-Out
- **Clinical Readout**: Converts completed patient intake into a natural medical verification script.
- **Real-Time Section Highlighting**: Highlights corresponding form sections and displays a live subtitle ticker as words are spoken.
- **Playback Controls**: Play, Pause, Resume, Stop, and Speed rate adjustment (1.0x, 1.25x).
- **Interactive Voice Confirmation**: Assistant asks *"Does all information sound correct? Say 'Confirm' or click Submit"* and listens for voice approval to advance.

### 5. Official Structured PDF Generation
- **Clinical Dossier Design**: Built with `jspdf` and `jspdf-autotable`.
- **Touchless Check-In QR Code**: Encodes patient demographic and emergency profile into a high-density QR code for hospital triage kiosks.
- **Safety Alert Banners**: Prominently highlights critical drug allergies (e.g. Penicillin anaphylaxis alert) in high-contrast red warning boxes.
- **Structured Sections**: Clean tabular layout for demographics, insurance, clinical history, medications, and vitals.
- **Digital Patient Signature**: Captures handwritten canvas signatures or electronic typed signature stamps with timestamps.
- **Instant In-Browser Preview & 1-Click Download**: Saves as `Aegis_Patient_Registration_<Name>_<ID>.pdf`.

### 6. Admissions Database & Persistence
- Asynchronous SQLite database with Write-Ahead Logging (WAL) and connection pooling via SQLAlchemy 2.0.
- Enterprise-grade clinical encounter persistence for patient master records, intake dossiers, and document attachments.
- Full-text search across patients, registration numbers, MRNs, phone numbers, and clinical departments.
- Transactional cascade and deletion lifecycle handling with regulatory append-only audit trail (`audit_events`).
- Dual PDF generation engine (client-side in-browser preview and server-side WeasyPrint authoritative compilation).

---

## 🚀 Getting Started

### Prerequisites
- **Python**: v3.10 or higher
- **Node.js**: v18 or higher
- **Package Managers**: `pip` and `npm`

---

### Step 1: Backend Setup (FastAPI & SQLite)

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   Copy the example environment configuration:
   ```bash
   # Windows (PowerShell)
   Copy-Item .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```
   Open `backend/.env` and configure:
   - `SECRET_KEY`: High-entropy 256-bit key for JWT signatures. Generate one using:
     ```bash
     python -c "import secrets; print(secrets.token_hex(32))"
     ```
   - `GROQ_API_KEY`: *(Optional)* Your Groq Cloud API key from [Groq Console](https://console.groq.com/keys) for clinical document AI extraction.
   - `ENVIRONMENT`: Set to `development` (or `production` for strict HTTPS security).

5. **Start the Backend API Server**:
   ```bash
   python run.py
   ```
   The backend service starts at **`http://127.0.0.1:8000`**.
   - Interactive Swagger API Documentation: `http://127.0.0.1:8000/docs`
   - ReDoc Reference: `http://127.0.0.1:8000/redoc`
   - System Health: `http://127.0.0.1:8000/api/v1/health`

---

### Step 2: Frontend Setup (React & Vite)

1. **Return to the project root directory**:
   ```bash
   cd ..
   ```

2. **Install Node dependencies**:
   ```bash
   npm install
   ```

3. **Start the Frontend Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:5173`. The Vite development proxy automatically routes `/api/` calls to the FastAPI backend.

4. **Build for Production**:
   ```bash
   npm run build
   ```
   Compiled production assets will be output to the `dist/` directory.

---

## 📁 Project Architecture

```
AI Form Application/
├── backend/                           # FastAPI Python Backend
│   ├── app/
│   │   ├── core/                      # Security (Argon2id, JWT), exceptions
│   │   ├── models/                    # SQLAlchemy 2.0 ORM models
│   │   ├── routers/                   # API endpoints (auth, patients, registrations, users, docs)
│   │   ├── schemas/                   # Pydantic v2 validation schemas
│   │   ├── services/                  # Business logic (AI extraction, PDF compile, audits)
│   │   ├── config.py                  # Pydantic BaseSettings & security validator
│   │   ├── database.py                # SQLite async engine, WAL pragma, schema bootstrap
│   │   └── main.py                    # FastAPI application, middleware, CORS
│   ├── tests/                         # Pytest test suite (105 integration & unit tests)
│   ├── .env.example                   # Environment configuration template
│   ├── pytest.ini                     # Pytest configuration
│   ├── requirements.txt               # Backend dependencies
│   └── run.py                         # Single-worker Uvicorn application runner
├── src/                               # React Frontend
│   ├── components/                    # UI views, forms, modals, and navigation
│   │   ├── ActivityLogView.jsx        # Telemetry & security audit logs viewer
│   │   ├── AdminSettingsView.jsx      # Hospital parameters and system configuration
│   │   ├── DocumentUploadModal.jsx    # PDF parser, OCR & AI mapping drawer
│   │   ├── LoginPage.jsx              # RBAC login portal
│   │   ├── PatientRecordsView.jsx     # Admissions Roster table & encounter management
│   │   ├── RegistrationWizard.jsx     # 6-step clinical intake wizard
│   │   ├── Sidebar.jsx                # Persistent navigation bar
│   │   ├── TopHeader.jsx              # Status, user profile & encounter indicators
│   │   └── UserManagementView.jsx     # Staff accounts and permission delegation console
│   ├── services/                      # Client APIs, AI extractors, speech STT/TTS
│   │   ├── api.js                     # Centralized Axios client & API endpoints
│   │   ├── aiExtractor.js             # Client-side heuristic clinical entity extractor
│   │   ├── pdfGenerator.js            # Client jsPDF dossier generation with QR code
│   │   ├── pdfParser.js               # PDF.js text extractor & Tesseract OCR
│   │   └── speechService.js           # Web Speech API recognition & TTS synthesis
│   ├── types/                         # Data structures and auth definitions
│   ├── App.jsx                        # Root application component & state orchestrator
│   └── main.jsx                       # React entry point
├── package.json                       # Frontend dependencies & scripts
├── vite.config.js                     # Vite bundler & API proxy configuration
├── tailwind.config.js                 # Tailwind CSS design system configuration
└── README.md                          # System documentation & setup guide
```

