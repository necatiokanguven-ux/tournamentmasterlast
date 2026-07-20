import { useEffect, useState } from "react";

/** Updates every second for live duration displays. */
export function useLiveSecond(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}
