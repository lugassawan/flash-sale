import { useState, useEffect } from 'react';

interface CountdownProps {
  startTime: string;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

function parseTime(value: string): number {
  const num = Number(value);
  if (!Number.isNaN(num) && num > 1e12) return num; // millisecond timestamp
  return new Date(value).getTime();
}

function calculateTimeLeft(startTime: string): TimeLeft | null {
  const diff = parseTime(startTime) - Date.now();
  if (diff <= 0) return null;

  return {
    hours: Math.floor(diff / (1000 * 60 * 60)),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

export function Countdown({ startTime }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => calculateTimeLeft(startTime));

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft(startTime);
      setTimeLeft(remaining);
      if (!remaining) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  if (!timeLeft) return null;

  return (
    <div className="countdown">
      <p className="countdown__label">Sale starts in</p>
      <div className="countdown__timer">
        <div className="countdown__segment">
          <span className="countdown__value">{padZero(timeLeft.hours)}</span>
          <span className="countdown__unit">hrs</span>
        </div>
        <span className="countdown__separator">:</span>
        <div className="countdown__segment">
          <span className="countdown__value">{padZero(timeLeft.minutes)}</span>
          <span className="countdown__unit">min</span>
        </div>
        <span className="countdown__separator">:</span>
        <div className="countdown__segment">
          <span className="countdown__value">{padZero(timeLeft.seconds)}</span>
          <span className="countdown__unit">sec</span>
        </div>
      </div>
    </div>
  );
}
