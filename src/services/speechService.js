// Speech Recognition (Speech-to-Text) & Speech Synthesis (Text-to-Speech) Service

/**
 * Check if Web Speech API Recognition is supported
 */
export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && 
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
}

/**
 * Check if Web Speech API Synthesis is supported
 */
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Create a Speech Recognition instance
 */
export function createSpeechRecognizer({
  onResult = () => {},
  onInterim = () => {},
  onError = () => {},
  onEnd = () => {},
  onStart = () => {},
  continuous = false,
  lang = 'en-US'
} = {}) {
  if (!isSpeechRecognitionSupported()) {
    onError(new Error('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.'));
    return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = continuous;
  recognition.interimResults = true;
  recognition.lang = lang;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onstart = () => {
    finalTranscript = '';
    onStart();
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    if (interimTranscript) {
      onInterim(interimTranscript);
    }
    if (finalTranscript) {
      onResult(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    onError(event.error);
  };

  recognition.onend = () => {
    onEnd(finalTranscript.trim());
  };

  return recognition;
}

/**
 * Text-to-Speech verification reader
 */
class TTSVerificationController {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.currentUtterance = null;
    this.isPlaying = false;
    this.isPaused = false;
  }

  getVoices() {
    if (!this.synth) return [];
    const voices = this.synth.getVoices();
    // Prioritize natural English voices
    return voices.filter(v => v.lang.startsWith('en'));
  }

  /**
   * Speak a structured array of sections with real-time section highlight callbacks
   * @param {Array<{ id: string, label: string, text: string }>} sections
   * @param {Object} options
   */
  speakSections(sections, {
    voice = null,
    rate = 1.0,
    pitch = 1.0,
    onSectionChange = () => {},
    onBoundary = () => {},
    onEnd = () => {},
    onError = () => {}
  } = {}) {
    this.stop();

    if (!this.synth) {
      onError(new Error('Speech synthesis is not supported.'));
      return;
    }

    if (!sections || sections.length === 0) {
      onEnd();
      return;
    }

    let currentIndex = 0;
    this.isPlaying = true;
    this.isPaused = false;

    const speakNext = () => {
      if (!this.isPlaying) return;

      if (currentIndex >= sections.length) {
        this.isPlaying = false;
        this.isPaused = false;
        onEnd();
        return;
      }

      const section = sections[currentIndex];
      onSectionChange(section.id, section.label, section.text);

      const utterance = new SpeechSynthesisUtterance(section.text);
      this.currentUtterance = utterance;

      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = Math.max(0.7, Math.min(1.5, rate));
      utterance.pitch = Math.max(0.8, Math.min(1.3, pitch));

      utterance.onboundary = (event) => {
        onBoundary({
          charIndex: event.charIndex,
          charLength: event.charLength,
          name: event.name
        });
      };

      utterance.onend = () => {
        currentIndex++;
        // Small pause between sections
        setTimeout(speakNext, 350);
      };

      utterance.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('TTS Error:', e);
          onError(e);
        }
        this.isPlaying = false;
        this.isPaused = false;
      };

      this.synth.speak(utterance);
    };

    speakNext();
  }

  pause() {
    if (this.synth && this.isPlaying && !this.isPaused) {
      this.synth.pause();
      this.isPaused = true;
    }
  }

  resume() {
    if (this.synth && this.isPlaying && this.isPaused) {
      this.synth.resume();
      this.isPaused = false;
    }
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isPlaying = false;
      this.isPaused = false;
      this.currentUtterance = null;
    }
  }
}

export const ttsController = new TTSVerificationController();

/**
 * Generate structured medical verification script from patient state
 */
export function generateVerificationScript(patient) {
  const sections = [];

  // Intro
  const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient';
  sections.push({
    id: 'intro',
    label: 'Introduction & Patient Identity',
    text: `Beginning verification review for registration record. Patient name: ${patientName}.`
  });

  // Demographics
  let demoText = '';
  if (patient.dateOfBirth) demoText += `Date of birth is ${patient.dateOfBirth}, age ${patient.age || 'not specified'}. `;
  if (patient.gender) demoText += `Gender: ${patient.gender}. `;
  if (patient.bloodGroup && patient.bloodGroup !== 'Unknown') demoText += `Blood group: ${patient.bloodGroup}. `;
  if (demoText) {
    sections.push({
      id: 'demographics',
      label: 'Demographics & Vitals Base',
      text: demoText.trim()
    });
  }

  // Contact & Emergency
  let contactText = '';
  if (patient.phone) contactText += `Primary contact number is ${patient.phone.split('').join(' ')}. `;
  if (patient.city || patient.state) contactText += `Residence: ${patient.city || ''} ${patient.state || ''}. `;
  if (patient.emergencyContactName) {
    contactText += `Emergency contact is ${patient.emergencyContactName}, ${patient.emergencyContactRelation || 'relationship not specified'}`;
    if (patient.emergencyContactPhone) {
      contactText += `, reachable at ${patient.emergencyContactPhone.split('').join(' ')}.`;
    } else {
      contactText += '.';
    }
  }
  if (contactText) {
    sections.push({
      id: 'contact',
      label: 'Contact & Emergency Information',
      text: contactText.trim()
    });
  }

  // Insurance
  if (patient.hasInsurance && patient.insuranceProvider) {
    let insText = `Health insurance provider is ${patient.insuranceProvider}. `;
    if (patient.policyNumber) insText += `Policy number is ${patient.policyNumber}. `;
    if (patient.groupNumber) insText += `Group number is ${patient.groupNumber}. `;
    sections.push({
      id: 'insurance',
      label: 'Health Insurance Details',
      text: insText.trim()
    });
  } else if (!patient.hasInsurance) {
    sections.push({
      id: 'insurance',
      label: 'Health Insurance Details',
      text: 'Patient is registered as self-pay without commercial insurance.'
    });
  }

  // Clinical & Allergies
  let clinicalText = '';
  if (patient.hasAllergies && patient.allergies && patient.allergies.length > 0) {
    clinicalText += `Critical Medical Alert: Patient has confirmed allergies to: ${patient.allergies.map(a => `${a.allergen}, reaction: ${a.reaction || 'allergic reaction'}`).join('; ')}. `;
  } else {
    clinicalText += 'No known drug allergies reported. ';
  }

  if (patient.chronicConditions && patient.chronicConditions.length > 0) {
    clinicalText += `Chronic conditions noted: ${patient.chronicConditions.join(', ')}. `;
  }

  if (patient.currentMedications && patient.currentMedications.length > 0) {
    clinicalText += `Current active medications include: ${patient.currentMedications.map(m => `${m.name} ${m.dosage || ''} ${m.frequency || ''}`).join(', ')}. `;
  }

  if (clinicalText) {
    sections.push({
      id: 'clinical',
      label: 'Medical History & Allergies',
      text: clinicalText.trim()
    });
  }

  // Visit Reason & Department
  let visitText = '';
  if (patient.department) visitText += `Scheduled for department: ${patient.department}. `;
  if (patient.chiefComplaint) visitText += `Primary reason for visit: ${patient.chiefComplaint}. `;
  if (patient.vitals?.bloodPressureSystolic && patient.vitals?.bloodPressureDiastolic) {
    visitText += `Recorded blood pressure is ${patient.vitals.bloodPressureSystolic} over ${patient.vitals.bloodPressureDiastolic}. `;
  }
  if (visitText) {
    sections.push({
      id: 'visit',
      label: 'Visit Reason & Vitals',
      text: visitText.trim()
    });
  }

  // Outro
  sections.push({
    id: 'conclusion',
    label: 'Verification Confirmation',
    text: 'Form verification read-out complete. Please review the details on your screen, confirm accuracy, and authorize submission.'
  });

  return sections;
}

/**
 * Sample voice audio simulations for environments without live microphone hardware
 */
export const SAMPLE_VOICE_INTAKES = [
  {
    title: 'New Patient Intake (Cardiac Consultation)',
    transcript: 'My name is Robert Anthony Chen. Date of birth is August 14 1982. My phone number is 415-555-7823. I live at 742 Evergreen Terrace, San Francisco, CA 94107. My emergency contact is Lisa Chen, my wife, at 415-555-9012. I have Blue Cross Blue Shield insurance, policy number BCBS-8821904. I am allergic to Sulfa drugs and Aspirin. I have hypertension and take Lisinopril 10mg once daily. I am registering for Cardiology due to recurring palpitations and chest tightness for the past 5 days.'
  },
  {
    title: 'Pediatric / General Intake',
    transcript: 'Patient name is Maria Elena Rodriguez. Born on November 23 1995, age 30, female, blood group O positive. Contact phone 312-555-4921, email maria.rodriguez@example.com. Emergency contact is Carlos Rodriguez, father, phone 312-555-8834. No known drug allergies. Medical history includes mild asthma, taking Albuterol inhaler as needed. Visiting General Medicine for persistent sinus headache and fever for 3 days.'
  },
  {
    title: 'Orthopedic Visit with Penicillin Allergy',
    transcript: 'My name is Marcus James Vance. Born May 6 1974. Blood type A negative. Phone is 206-555-3341. Address is 1208 Pine Street, Seattle Washington 98101. Critical alert: I have a severe anaphylactic allergy to Penicillin. I also have Type 2 Diabetes, taking Metformin 500mg twice daily. Registering for Orthopedics for severe right knee swelling and pain after a fall.'
  }
];

