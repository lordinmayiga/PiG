import { useEffect, useState } from 'react';

/**
 * pig-loading-states' "never show a loader until 300ms in" rule, as a
 * reusable hook. Pass the raw in-flight boolean; get back whether enough
 * time has passed to actually render a spinner/skeleton for it. Flips back
 * to false immediately (no delay) once `active` goes false.
 */
export function useDelayedLoading(active: boolean, delayMs = 300): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return visible;
}
