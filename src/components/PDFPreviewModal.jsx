import React, { useEffect } from 'react';
import { Download, Printer, CheckCircle2, X, FileText, Share2, Sparkles, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function PDFPreviewModal({
  isOpen,
  onClose,
  pdfData,
  patientData
}) {
  useEffect(() => {
    if (isOpen) {
      // Fire celebration confetti!
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 }
        });
      } catch (e) { }
    }
  }, [isOpen]);

  if (!isOpen || !pdfData) return null;

  const handleDownload = () => {
    if (pdfData.save) {
      pdfData.save();
    } else if (pdfData.dataUrl) {
      const link = document.createElement('a');
      link.href = pdfData.dataUrl;
      link.download = pdfData.fileName || 'Patient_Registration.pdf';
      link.click();
    }
  };

  const handlePrint = () => {
    if (pdfData.blob) {
      const blobUrl = URL.createObjectURL(pdfData.blob);
      const printWindow = window.open(blobUrl);
      if (printWindow) {
        printWindow.focus();
        setTimeout(() => printWindow.print(), 500);
      }
    }
  };

  const patientName = `${patientData?.firstName || ''} ${patientData?.lastName || ''}`.trim() || 'Patient';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Success Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-teal-950 text-white p-5 sm:p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300 shadow-sm">
              <CheckCircle2 size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-white tracking-tight">Registration Confirmed & PDF Dossier Ready</h2>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Official Record
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Patient record for <strong className="text-white">{patientName}</strong> has been verified, encrypted, and registered under ID: <strong className="text-teal-300 font-mono">{patientData?.registrationId || 'AEGIS-2026'}</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FileText size={16} className="text-teal-600" />
            <span className="font-semibold text-slate-800">{pdfData.fileName}</span>
            <span className="text-slate-400">• Ready for triage desk check-in</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Printer size={14} /> Print Record
            </button>
            <button
              onClick={handleDownload}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 flex items-center gap-2 transition-transform active:scale-95"
            >
              <Download size={14} /> Download Structured PDF
            </button>
          </div>
        </div>

        {/* PDF Viewer Body */}
        <div className="flex-1 bg-slate-100 p-4 overflow-hidden flex items-center justify-center">
          {pdfData.dataUrl ? (
            <iframe
              src={pdfData.dataUrl}
              title="Patient Registration PDF Preview"
              className="w-full h-full rounded-xl border border-slate-300 shadow-md bg-white min-h-[460px]"
            />
          ) : (
            <div className="text-center p-8 bg-white rounded-xl shadow-sm border border-slate-200">
              <FileText size={48} className="text-teal-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-800">PDF successfully generated.</p>
              <button
                onClick={handleDownload}
                className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold"
              >
                Download PDF File
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            A copy has been recorded in the local Admissions Database.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold"
          >
            Done & Return to Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}

