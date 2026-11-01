"""Focused tests for AEGIS Patient Name Extraction Accuracy.

Verifies:
1. First Name, Middle Name, and Last Name identification across standard layouts:
   - "Patient Name: First Middle Last"
   - "Name: Last, First Middle"
   - "Given Name: First" and "Family Name: Last"
   - Multiline OCR ("Patient Name\\nFirst Last")
   - Table formats ("| Patient Name | First Last |")
   - Title and suffix stripping ("Mr. First Last Jr.")
2. Non-patient entity protection:
   - Doctors ("Dr. Sarah Jenkins", "Attending Physician: Dr. Vance") are NEVER mistaken for the patient.
   - Hospital / Facility names ("Mercy General Hospital") are NEVER mistaken for the patient.
   - Emergency contacts / guardians ("Emergency Contact: Jennifer Miller") are NEVER mistaken for the patient.
   - Insurance policy holders ("Policy Holder: Sarah Wright") are NEVER mistaken for the patient.
3. Ambiguous or missing names return None (never invent names).
4. Coexistence tests: Both doctor and patient present -> extracts patient, leaves doctor out of patient identity.
"""

import pytest
from app.services.ai_service import (
    extract_patient_name_heuristic,
    execute_heuristic_regex_fallback,
)


def test_standard_patient_name_extraction():
    text = (
        "MERCY GENERAL HOSPITAL - PATIENT INTAKE\n"
        "Patient Name: David Michael Miller\n"
        "DOB: 1985-04-12\n"
        "Attending Physician: Dr. Sarah Jenkins, MD\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full == "David Michael Miller"
    assert first == "David"
    assert middle == "Michael"
    assert last == "Miller"
    assert conf >= 0.90


def test_comma_separated_last_first_format():
    text = (
        "METRO HEALTH LABS & CARDIOLOGY REFERRAL CENTER\n"
        "PATIENT DATA:\n"
        "Name: Rodriguez, Maria Elena\n"
        "Date of Birth: 1995-11-23\n"
        "Physician: Dr. Maya Patel, MD\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full == "Maria Elena Rodriguez"
    assert first == "Maria"
    assert middle == "Elena"
    assert last == "Rodriguez"
    assert conf >= 0.90


def test_separate_given_and_family_name_fields():
    text = (
        "HEALTHCARE REGISTRATION PORTAL\n"
        "First Name: Lucas\n"
        "Last Name: Wright\n"
        "DOB: 2018-06-19\n"
        "Attending: Dr. Emily Thornton, MD\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full == "Lucas Wright"
    assert first == "Lucas"
    assert middle is None
    assert last == "Wright"
    assert conf >= 0.95

    # Also test Given Name / Surname
    text_intl = (
        "GOVERNMENT HOSPITAL INTAKE\n"
        "Given Name: Alexander\n"
        "Surname: Hamilton\n"
        "Date: 2026-01-10\n"
    )
    full2, first2, middle2, last2, conf2 = extract_patient_name_heuristic(text_intl)
    assert full2 == "Alexander Hamilton"
    assert first2 == "Alexander"
    assert last2 == "Hamilton"


def test_multiline_ocr_name_extraction():
    # Common OCR pattern where label and value are on consecutive lines
    text = (
        "CLINICAL ASSESSMENT FORM\n"
        "Patient Name\n"
        "Samantha Lee Miller\n"
        "DOB: 1992-04-10\n"
        "Blood Group: O+\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full == "Samantha Lee Miller"
    assert first == "Samantha"
    assert middle == "Lee"
    assert last == "Miller"


def test_table_format_patient_name_extraction():
    # Common table/markdown grid layout in reports
    text = (
        "| Field | Value |\n"
        "| Patient Name | Robert Anthony Chen |\n"
        "| DOB | 08/14/1982 |\n"
        "| Sex | Male |\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full == "Robert Anthony Chen"
    assert first == "Robert"
    assert middle == "Anthony"
    assert last == "Chen"


def test_title_and_honorific_stripping():
    text = (
        "ADMISSION DOSSIER\n"
        "Patient Name: Mr. David Miller Jr.\n"
        "DOB: 1980-01-01\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert first == "David"
    assert last == "Miller"
    assert "Mr." not in first
    assert "Mr." not in full


def test_doctor_and_hospital_never_mistaken_for_patient():
    # Ambiguous document without patient name, but mentions hospital and doctor
    text = (
        "===============================================================\n"
        "MERCY GENERAL HOSPITAL - PATIENT DISCHARGE SUMMARY\n"
        "Department of Internal Medicine | 100 Hospital Drive\n"
        "===============================================================\n"
        "Attending Physician: Dr. Sarah Jenkins, MD\n"
        "Consulting Doctor: Dr. Gregory Vance\n"
        "Department: Cardiology\n"
        "BP: 120/80 mmHg\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full is None
    assert first is None
    assert last is None
    assert conf == 0.0


def test_emergency_contact_and_insurance_holder_never_mistaken_for_patient():
    # Document with only emergency contact and policy holder, no patient name
    text = (
        "EMERGENCY ADMISSION REPORT\n"
        "Emergency Contact: Jennifer Miller (Spouse)\n"
        "Emergency Phone: (415) 555-9924\n"
        "Policy Holder: Sarah Wright\n"
        "Insurance Provider: Blue Cross\n"
        "Blood Group: A+\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full is None
    assert first is None
    assert last is None


def test_coexisting_doctor_emergency_and_patient():
    # Document containing doctor, emergency contact, policy holder, and patient
    text = (
        "VALLEY PEDIATRIC HEALTHCARE\n"
        "Attending: Dr. Emily Thornton, MD\n"
        "Emergency Contact: Sarah Wright (Mother)\n"
        "Policy Holder: Sarah Wright\n"
        "Full Name: Lucas Alexander Wright\n"
        "DOB: 2018-06-19\n"
    )
    full, first, middle, last, conf = extract_patient_name_heuristic(text)
    assert full == "Lucas Alexander Wright"
    assert first == "Lucas"
    assert middle == "Alexander"
    assert last == "Wright"
    # Never confuse with Sarah Wright or Dr. Emily Thornton
    assert first != "Sarah"
    assert first != "Emily"


def test_heuristic_regex_fallback_populates_all_name_fields():
    text = (
        "CLINICAL INTAKE SHEET\n"
        "Patient Name: Jane Marie Smith\n"
        "DOB: 1988-03-14\n"
        "Phone: +1 555-123-4567\n"
        "Email: jane.smith@example.com\n"
        "Attending: Dr. Sarah Jenkins, MD\n"
        "Emergency Contact: Bob Smith (Spouse)\n"
        "Emergency Phone: +1 555-987-6543\n"
        "Insurance: Blue Cross\n"
        "Policy #: BC-99881\n"
        "Blood Group: O+\n"
    )
    fields, confidences = execute_heuristic_regex_fallback(text)
    assert fields.full_name == "Jane Marie Smith"
    assert fields.first_name == "Jane"
    assert fields.middle_name == "Marie"
    assert fields.last_name == "Smith"
    assert fields.date_of_birth == "1988-03-14"
    assert fields.blood_group == "O+"
    assert fields.preferred_doctor == "Dr. Sarah Jenkins"
    assert fields.emergency_contact_name == "Bob Smith"
    assert fields.insurance_provider == "Blue Cross"
    assert confidences["first_name"] >= 0.90
    assert confidences["last_name"] >= 0.90

