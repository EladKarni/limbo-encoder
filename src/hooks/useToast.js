import {
  useState, useRef, useEffect, useCallback,
} from 'react';

// Transient status toasts. showToast(message, tone) replaces any current toast
// and auto-dismisses it — errors linger longer since they carry more
// consequence. Anything the user must not miss goes in the persistent error
// card instead, never here.
export default function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, tone = 'ok') => {
    clearTimeout(timerRef.current);
    setToast({ message, tone });
    timerRef.current = setTimeout(() => setToast(null), tone === 'error' ? 6000 : 2400);
  }, []);

  // Clear a pending dismissal on unmount.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { toast, showToast };
}
