import { useEffect, useRef, useState } from "react";

type Props = {
  value: number;
  duration?: number;
  format?: (n: number) => string;
};

export function AnimatedNumber({ value, duration = 800, format }: Props) {
  const [display, setDisplay] = useState(value);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    startRef.current = null;
    const target = value;

    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = fromRef.current + (target - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return <>{format ? format(display) : Math.round(display).toLocaleString()}</>;
}
