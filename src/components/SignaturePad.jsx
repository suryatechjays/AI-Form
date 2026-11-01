import React, { useRef, useState, useEffect } from 'react';
import { PenTool, Type, RotateCcw, Check } from 'lucide-react';

export default function SignaturePad({
  value,
  onChange,
  patientName = 'Patient Signature'
}) {
  const [mode, setMode] = useState('draw'); // 'draw' | 'type'
  const [typedName, setTypedName] = useState(patientName || '');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [mode]);

  const startDrawing = (e) => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e) => {
    if (!isDrawing || mode !== 'draw') return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && onChange) {
      onChange({
        type: 'draw',
        dataUrl: canvas.toDataURL('image/png'),
        typedSignature: typedName
      });
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      if (onChange) {
        onChange({
          type: mode,
          dataUrl: '',
          typedSignature: mode === 'type' ? typedName : ''
        });
      }
    }
  };

  const handleTypedChange = (e) => {
    const val = e.target.value;
    setTypedName(val);
    setHasSignature(val.trim().length > 0);

    // Render typed signature to canvas so we have a reliable dataUrl for the PDF!
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'italic 28px "Brush Script MT", "Caveat", "Segoe Script", cursive, serif';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val, canvas.width / 2, canvas.height / 2);

      if (onChange) {
        onChange({
          type: 'type',
          dataUrl: canvas.toDataURL('image/png'),
          typedSignature: val
        });
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'draw'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenTool size={13} /> Draw Signature
          </button>
          <button
            type="button"
            onClick={() => setMode('type')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'type'
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Type size={13} /> Type Signature
          </button>
        </div>

        <button
          type="button"
          onClick={clearCanvas}
          className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 font-medium transition-colors"
        >
          <RotateCcw size={12} /> Clear
        </button>
      </div>

      {mode === 'type' && (
        <div>
          <input
            type="text"
            value={typedName}
            onChange={handleTypedChange}
            placeholder="Type your full legal name..."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
          />
        </div>
      )}

      {/* Signature Canvas Box */}
      <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden shadow-inner flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={500}
          height={140}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`w-full h-36 ${mode === 'draw' ? 'cursor-crosshair' : 'cursor-default'}`}
        />

        {!hasSignature && mode === 'draw' && (
          <div className="absolute pointer-events-none text-slate-400 text-xs flex items-center gap-1.5">
            <PenTool size={14} />
            <span>Sign here using your mouse or touchscreen</span>
          </div>
        )}

        {/* Legal watermark line */}
        <div className="absolute bottom-3 left-6 right-6 border-b border-slate-200 pointer-events-none flex items-center justify-between text-[10px] text-slate-400">
          <span>X Patient Digital Signature</span>
          <span>Date: {new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

