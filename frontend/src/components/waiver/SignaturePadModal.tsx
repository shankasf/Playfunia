import { useCallback, useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import styles from './SignaturePadModal.module.css';

interface SignaturePadModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: (dataUrl: string) => void;
}

export function SignaturePadModal({ open, onClose, onAccept }: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Save current signature data
    const pad = padRef.current;
    const data = pad?.toData();

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
    }

    // Restore signature data after resize
    if (pad && data && data.length > 0) {
      pad.fromData(data);
    }
  }, []);

  // Lock body scroll and dismiss keyboard when modal opens
  useEffect(() => {
    if (!open) return;
    // Blur any focused input to dismiss the virtual keyboard
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Small delay to let the modal render and get proper dimensions
    const initTimer = setTimeout(() => {
      resizeCanvas();

      const pad = new SignaturePad(canvas, {
        backgroundColor: 'rgba(255, 255, 255, 0)',
        penColor: '#1e3a8a',
        minWidth: 1.5,
        maxWidth: 3.5,
        velocityFilterWeight: 0.7,
      });

      pad.addEventListener('endStroke', () => {
        setIsEmpty(pad.isEmpty());
      });

      padRef.current = pad;
      setIsEmpty(true);
    }, 50);

    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('resize', handleResize);
      if (padRef.current) {
        padRef.current.off();
        padRef.current = null;
      }
    };
  }, [open, resizeCanvas]);

  const handleClear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
  };

  const handleAccept = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;

    // Export as PNG data URL with trimmed whitespace
    const dataUrl = pad.toDataURL('image/png');
    onAccept(dataUrl);
  };

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Sign Below</h3>
          <p className={styles.subtitle}>
            Use your finger, stylus, or mouse to sign
          </p>
        </div>

        <div className={styles.canvasContainer} ref={containerRef}>
          {/* tabIndex -1 + inputMode none prevents mobile keyboard from appearing */}
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            tabIndex={-1}
            inputMode="none"
            onKeyDown={(e) => e.preventDefault()}
          />
          <div className={styles.signLine} />
          <span className={styles.signLabel}>Sign here</span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={handleClear}
            disabled={isEmpty}
          >
            Clear
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.acceptButton}
            onClick={handleAccept}
            disabled={isEmpty}
          >
            Accept Signature
          </button>
        </div>
      </div>
    </div>
  );
}
