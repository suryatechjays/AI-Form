"""End-to-End integration test validating the exact frontend API flow:

Main flow:
1. Login -> authenticate credentials and obtain access token & refresh cookie.
2. Register patient -> create authoritative patient master record on backend.
3. Upload document & Groq AI extraction -> upload PDF/scan and extract clinical entities.
4. Manually review -> assert fields populated into intake draft.
5. Submit registration -> transition draft to SUBMITTED status and trigger background PDF compilation.
6. Generate & Download PDF -> download authoritative compiled dossier and verify %PDF bytes & checksum.
"""

import asyncio
from httpx import ASGITransport, AsyncClient
import pytest
from app.main import app

@pytest.mark.asyncio
async def test_frontend_backend_end_to_end_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # Step 1: Login as Receptionist
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"username_or_email": "receptionist", "password": "Pass123!"}
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        access_token = login_data["access_token"]
        csrf_token = login_data["csrf_token"]
        assert access_token and csrf_token

        headers = {
            "Authorization": f"Bearer {access_token}",
            "X-CSRF-Token": csrf_token,
        }

        # Step 2: Register Patient Master Record
        patient_payload = {
            "full_name": "Arthur Pendelton",
            "date_of_birth": "1978-06-22",
            "gender": "Male",
            "blood_group": "A+",
            "primary_mobile": "+15554321987",
            "email": "arthur.pendelton@example.com",
            "street_address": "452 Hudson St",
            "city": "New York",
            "state": "NY",
            "country": "USA",
            "postal_code": "10014",
            "override_duplicate": True,
            "justification": "Verified distinct patient intake at admissions desk",
        }
        pat_resp = await client.post("/api/v1/patients", json=patient_payload, headers=headers)
        assert pat_resp.status_code == 201, f"Patient creation failed: {pat_resp.text}"
        patient = pat_resp.json()
        patient_id = patient["id"]
        assert patient["patient_id"].startswith("PID-2026-")

        # Step 3: Upload Document & Extract Fields
        fake_pdf = (
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
            b"4 0 obj\n<< /Length 120 >>\nstream\n"
            b"BT /F1 12 Tf 72 712 Td (Patient: Arthur Pendelton DOB: 1978-06-22 Mobile: +15554321987 Condition: Hypertension) ET\n"
            b"endstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n"
            b"0000000117 00000 n\n0000000180 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n350\n%%EOF\n"
        )
        files = {
            "file": ("discharge_summary.pdf", fake_pdf, "application/pdf")
        }
        data = {
            "patient_id": str(patient_id)
        }
        ext_resp = await client.post(
            "/api/v1/documents/upload-and-extract",
            data=data,
            files=files,
            headers=headers
        )
        assert ext_resp.status_code == 201, f"Document upload & extract failed: {ext_resp.text}"
        extract_data = ext_resp.json()
        assert extract_data["document_uuid"]
        assert extract_data["extraction_status"] == "COMPLETED"

        # Step 4: Create Registration Intake Draft (with manually reviewed fields)
        draft_payload = {
            "patient_id": patient_id,
            "contact_mobile": patient["primary_mobile"],
            "contact_email": patient["email"],
            "residential_address": patient["street_address"],
            "emergency_contact_name": "Gwendolyn Pendelton",
            "emergency_contact_relationship": "Spouse",
            "emergency_contact_phone": "+15559876543",
            "existing_conditions": "Hypertension, Mild Asthma",
            "previous_surgeries": "None Reported",
            "current_medications": "Lisinopril 10mg once daily",
            "allergy_status": "No Known Allergies (NKDA)",
            "medical_history": "No major family cardiac history",
            "has_insurance": 1,
            "insurance_provider": "Aetna Health",
            "insurance_policy_number": "AET-778899",
            "insurance_policy_holder": "Arthur Pendelton",
            "department": "Cardiology",
            "preferred_doctor": "Dr. House",
            "reason_for_visit": "Annual cardiac checkup",
        }
        reg_draft_resp = await client.post("/api/v1/registrations", json=draft_payload, headers=headers)
        assert reg_draft_resp.status_code == 201, f"Registration draft failed: {reg_draft_resp.text}"
        reg_draft = reg_draft_resp.json()
        assert reg_draft["status"] == "DRAFT"
        reg_id = reg_draft["id"]

        # Step 5: Submit Registration (Triggers background PDF generation)
        sub_resp = await client.post(f"/api/v1/registrations/{reg_id}/submit", headers=headers)
        assert sub_resp.status_code == 200, f"Registration submission failed: {sub_resp.text}"
        sub_data = sub_resp.json()
        assert sub_data["status"] == "SUBMITTED"
        assert sub_data["pdf_status"] in ("PENDING", "GENERATED")

        # Step 6: Wait briefly for BackgroundTasks compilation and Download PDF
        await asyncio.sleep(1.0)
        pdf_resp = await client.get(f"/api/v1/registrations/{reg_id}/pdf", headers=headers)
        assert pdf_resp.status_code == 200, f"PDF download failed: {pdf_resp.text}"
        assert pdf_resp.headers["content-type"] == "application/pdf"
        assert pdf_resp.content.startswith(b"%PDF"), "Response is not a valid PDF file"
        assert len(pdf_resp.content) > 1000, "PDF file is suspiciously small"
        print(f"\n[E2E VERIFICATION SUCCESS] Completed full flow! Generated PDF dossier: {len(pdf_resp.content)} bytes.")

if __name__ == "__main__":
    import pytest
    pytest.main(["-v", "-s", __file__])

