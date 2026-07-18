/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTournament } from "../useTournament";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, Monitor, ArrowLeft, ArrowRight, ShieldAlert, CheckCircle2, SkipBack, SkipForward, Coffee, Check, X } from "lucide-react";
import { BlindLevel, PayoutStructure } from "../types";
import { DESIGN_HEIGHT, DESIGN_WIDTH, calcDisplayScale } from "../displaySettings";
import TrackingQrCode from "./TrackingQrCode";

interface ClockViewProps {
  pendingFullscreen?: boolean;
  onFullscreenHandled?: () => void;
}

type MilestoneOverlay = "bubble" | "final" | null;

const MILESTONE_ASSETS = {
  bubble: { image: "/bubbletime.png", audio: "/buble.mp3", label: "BUBBLE TIME" },
  final: { image: "/finaltable.png", audio: "/finaltable.mp3", label: "FINAL TABLE" },
} as const;

const FINAL_TABLE_FALL_OBJECTS = [
  { src: "/image/obje1.png", isLarge: true, category: "trophy" as const },
  { src: "/image/obje2.png", isLarge: false, category: "chip" as const },
  { src: "/image/obje3.png", isLarge: false, category: "chip" as const },
  { src: "/image/obje4.png", isLarge: false, category: "chip" as const },
  { src: "/image/obje5.png", isLarge: false, category: "chip" as const },
  { src: "/image/obje6.png", isLarge: false, category: "money" as const },
  { src: "/image/obje7.png", isLarge: false, category: "money" as const },
  { src: "/image/obje8.png", isLarge: false, category: "money" as const },
] as const;

const FINAL_TABLE_OBJECT_GROUPS = {
  trophy: FINAL_TABLE_FALL_OBJECTS.filter((o) => o.category === "trophy"),
  chips: FINAL_TABLE_FALL_OBJECTS.filter((o) => o.category === "chip"),
  money: FINAL_TABLE_FALL_OBJECTS.filter((o) => o.category === "money"),
  all: FINAL_TABLE_FALL_OBJECTS,
};

const FALL_OBJECT_BASE_SIZE = 69;
const FALL_OBJECT_LARGE_SIZE = Math.round(FALL_OBJECT_BASE_SIZE * 1.5);
const FALL_OBJECT_DURATION_S = 12;
const FALL_OBJECT_COUNT = 48;
const SCRIPTED_SEGMENT_MS = 30000;
const SCRIPTED_SEGMENTS = ["trophy", "chips", "money", "all"] as const;

type FinalTableFallPhase = "continuous" | "scripted";
type ScriptedFallSegment = (typeof SCRIPTED_SEGMENTS)[number];

type FallingParticle = {
  id: string;
  src: string;
  size: number;
  left: string;
  delay: string;
  drift: string;
  durationS: number;
};

type FallAsset = (typeof FINAL_TABLE_FALL_OBJECTS)[number];

function playEliminatedSound(enabled: boolean) {
  if (!enabled) return;

  const audio = new Audio("/eliminated.mp3");
  audio.play().catch(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Ignore audio fallback errors.
    }
  });
}

function pickVariedAssets(assets: readonly FallAsset[], count: number): FallAsset[] {
  if (assets.length === 0) return [];
  if (assets.length === 1) return Array.from({ length: count }, () => assets[0]);

  const picked: FallAsset[] = [];
  let pool = [...assets].sort(() => Math.random() - 0.5);

  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      pool = [...assets].sort(() => Math.random() - 0.5);
    }
    picked.push(pool.pop()!);
  }

  return picked;
}

function createFallParticles(
  assets: readonly FallAsset[],
  count: number,
  maxDelayS: number,
  durationS: number,
  idPrefix: string,
  varied = false,
): FallingParticle[] {
  const variedAssets = varied ? pickVariedAssets(assets, count) : null;

  return Array.from({ length: count }, (_, index) => {
    const asset = variedAssets ? variedAssets[index] : assets[Math.floor(Math.random() * assets.length)];
    return {
      id: `${idPrefix}-${index}`,
      src: asset.src,
      size: asset.isLarge ? FALL_OBJECT_LARGE_SIZE : FALL_OBJECT_BASE_SIZE,
      left: `${Math.random() * 96}%`,
      delay: `${(Math.random() * maxDelayS).toFixed(2)}s`,
      drift: `${((Math.random() - 0.5) * 64).toFixed(0)}px`,
      durationS,
    };
  });
}

export default function ClockView({ pendingFullscreen = false, onFullscreenHandled }: ClockViewProps) {
  const {
    state,
    startTimer,
    pauseTimer,
    adjustTime,
    setLevel,
    toggleSound,
    undoLastHistory,
    resetDatabase
  } = useTournament();

  const { clock, settings, players, history, payouts, tables } = state;
  const [payoutIndex, setPayoutIndex] = useState(0);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [payoutOffset, setPayoutOffset] = useState(0);
  const PAYOUTS_PER_PAGE = 9;
  const [isDisplayFullscreen, setIsDisplayFullscreen] = useState(false);
  const [displayScale, setDisplayScale] = useState(1);

  const updateDisplayScale = useCallback(() => {
    const isActive = document.fullscreenElement === containerRef.current;
    setIsDisplayFullscreen(isActive);
    if (isActive) {
      setDisplayScale(calcDisplayScale(window.innerWidth, window.innerHeight));
    } else {
      setDisplayScale(1);
    }
  }, []);

  // Resume/Unlock Audio Context on user click anywhere
  useEffect(() => {
    const resumeAudio = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
        }
      } catch (e) {}
    };
    window.addEventListener('click', resumeAudio);
    return () => window.removeEventListener('click', resumeAudio);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const pageCount = Math.ceil(payouts.length / PAYOUTS_PER_PAGE);
    if (pageCount <= 1) {
      setPayoutOffset(0);
      return;
    }

    const interval = setInterval(() => {
      setPayoutOffset((prev) => {
        const next = prev + PAYOUTS_PER_PAGE;
        return next >= payouts.length ? 0 : next;
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [payouts.length]);

  // Audio synthesizer for deep bass drop / boom sound
  const playBoomSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      // Sub oscillator (Deep bass)
      const osc1 = ctx.createOscillator();
      const osc1Gain = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(120, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 1.8);
      osc1Gain.gain.setValueAtTime(0.6, ctx.currentTime);
      osc1Gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.8);
      
      // Mid punch oscillator (Audible on low-end speakers/laptops)
      const osc2 = ctx.createOscillator();
      const osc2Gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(220, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 1.5);
      
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 1.5);
      filter.Q.setValueAtTime(5, ctx.currentTime); // Some resonance for fatness!
      
      osc2Gain.gain.setValueAtTime(0.35, ctx.currentTime);
      osc2Gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
      
      // Connect sub
      osc1.connect(osc1Gain);
      osc1Gain.connect(ctx.destination);
      
      // Connect mid-punch
      osc2.connect(filter);
      filter.connect(osc2Gain);
      osc2Gain.connect(ctx.destination);
      
      osc1.start();
      osc2.start();
      
      osc1.stop(ctx.currentTime + 1.8);
      osc2.stop(ctx.currentTime + 1.5);
    } catch (e) {
      console.warn("AudioContext boom sound error", e);
    }
  };

  const [blinkingEvents, setBlinkingEvents] = useState<{ [eventId: string]: boolean }>({});
  const [milestoneOverlay, setMilestoneOverlay] = useState<MilestoneOverlay>(null);
  const [finalTableFallPhase, setFinalTableFallPhase] = useState<FinalTableFallPhase>("scripted");
  const [scriptedSegment, setScriptedSegment] = useState<ScriptedFallSegment>("trophy");
  const [scriptCycleKey, setScriptCycleKey] = useState(0);
  const [scriptWaveKey, setScriptWaveKey] = useState(0);
  const processedEventIds = useRef<Set<string>>(new Set());
  const prevRemainingCountRef = useRef<number | null>(null);
  const milestoneAudioRef = useRef<HTMLAudioElement | null>(null);
  const milestoneOverlayRef = useRef<MilestoneOverlay>(null);
  const milestonePausedByMuteRef = useRef(false);
  const milestoneOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundEnabledRef = useRef(clock.soundEnabled);
  const activeSoundEffectsRef = useRef<HTMLAudioElement[]>([]);
  const hasActiveBust = Object.keys(blinkingEvents).length > 0;

  useEffect(() => {
    soundEnabledRef.current = clock.soundEnabled;
  }, [clock.soundEnabled]);

  useEffect(() => {
    milestoneOverlayRef.current = milestoneOverlay;
  }, [milestoneOverlay]);

  const clearMilestoneOverlayTimeout = useCallback(() => {
    if (milestoneOverlayTimeoutRef.current) {
      clearTimeout(milestoneOverlayTimeoutRef.current);
      milestoneOverlayTimeoutRef.current = null;
    }
  }, []);

  const registerActiveAudio = useCallback((audio: HTMLAudioElement) => {
    activeSoundEffectsRef.current.push(audio);
    const removeFromActive = () => {
      activeSoundEffectsRef.current = activeSoundEffectsRef.current.filter((item) => item !== audio);
    };
    audio.addEventListener("ended", removeFromActive, { once: true });
    audio.addEventListener("error", removeFromActive, { once: true });
  }, []);

  const pauseClockAudioForMute = useCallback(() => {
    if (milestoneAudioRef.current && !milestoneAudioRef.current.paused) {
      milestoneAudioRef.current.pause();
      milestonePausedByMuteRef.current = true;
    }

    activeSoundEffectsRef.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    activeSoundEffectsRef.current = [];
  }, []);

  const resumeMilestoneAudio = useCallback(() => {
    const audio = milestoneAudioRef.current;
    if (!audio || !milestoneOverlayRef.current) return;

    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          milestonePausedByMuteRef.current = false;
        })
        .catch((err) => {
          console.warn("Could not resume milestone audio:", err);
        });
    }
  }, []);

  useEffect(() => {
    if (!clock.soundEnabled) {
      pauseClockAudioForMute();
      return;
    }

    const audio = milestoneAudioRef.current;
    if (audio && milestoneOverlayRef.current && audio.paused) {
      resumeMilestoneAudio();
    }
  }, [clock.soundEnabled, pauseClockAudioForMute, resumeMilestoneAudio]);

  // First time initialization of existing bust events
  useEffect(() => {
    if (processedEventIds.current.size === 0) {
      history.forEach(evt => {
        if (evt.type === 'bust') {
          const eventTime = new Date(evt.timestamp).getTime();
          const now = Date.now();
          const diffSeconds = (now - eventTime) / 1000;
          // Only skip blinking if it's older than 15 seconds
          if (diffSeconds >= 15) {
            processedEventIds.current.add(evt.id);
          }
        }
      });
    }
  }, [history]);

  // Monitor for newly added bust events
  useEffect(() => {
    const newBustEvents = history.filter(evt => evt.type === 'bust' && !processedEventIds.current.has(evt.id));
    if (newBustEvents.length > 0) {
      newBustEvents.forEach(evt => {
        processedEventIds.current.add(evt.id);
        
        // Add to active blinking list
        setBlinkingEvents(prev => ({ ...prev, [evt.id]: true }));
        
        // Play eliminated.mp3 if sound is enabled (no fallback beep/synth)
        if (clock.soundEnabled) {
          playEliminatedSound(true);
        }
        
        // Remove from blinking after exactly 7 seconds
        setTimeout(() => {
          setBlinkingEvents(prev => {
            const next = { ...prev };
            delete next[evt.id];
            return next;
          });
        }, 7000);
      });
    }
  }, [history, clock.soundEnabled]);

  const activeLevel = settings.blindStructure[clock.currentLevelIndex] || {
    level: 1,
    smallBlind: 0,
    bigBlind: 0,
    ante: 0,
    duration: 20,
    isBreak: false
  };

  let nextLevel = settings.blindStructure[clock.currentLevelIndex + 1] || null;
  if (nextLevel && nextLevel.isBreak) {
    let foundNonBreak = null;
    for (let i = clock.currentLevelIndex + 2; i < settings.blindStructure.length; i++) {
      if (!settings.blindStructure[i].isBreak) {
        foundNonBreak = settings.blindStructure[i];
        break;
      }
    }
    nextLevel = foundNonBreak;
  }

  // Format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Format HH:MM:SS
  const formatHHMMSS = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, "0");
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Elapsed time formatter
  const formattedElapsed = formatHHMMSS(clock.elapsedTime);

  // Remaining playing players
  const totalPlayers = players.length;
  const playingPlayers = players.filter(p =>
    p.status === "Playing"
    || p.status === "Waiting"
    || p.status === "Registered"
    || p.status === "Re-entry"
  );
  const remainingPlayersCount = playingPlayers.length;

  const hasSeatedActivePlayers = useMemo(
    () =>
      players.some(
        (player) =>
          (player.status === "Playing" ||
            player.status === "Registered" ||
            player.status === "Waiting" ||
            player.status === "Re-entry") &&
          player.tableId !== null,
      ),
    [players],
  );

  const totalReentries = players.reduce((sum, p) => sum + (p.reentries || 0), 0);
  const totalRebuys = players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
  const totalAddons = players.reduce((sum, p) => sum + (p.addons || 0), 0);
  const totalEntriesCount = totalPlayers + totalReentries;

  // Fee amount is not included in the prize pool total
  const calculatedPrizePool = (totalEntriesCount + totalRebuys + totalAddons) * settings.buyIn;
  const totalPrizePool = settings.customPrizePool !== undefined && settings.customPrizePool !== null ? settings.customPrizePool : calculatedPrizePool;

  // ITM status and Next Pay calculation
  const FINAL_TABLE_PLAYERS = 9;
  const isFinalTable = remainingPlayersCount === FINAL_TABLE_PLAYERS;
  const isBubbleTime = payouts.length > 0 && remainingPlayersCount === payouts.length + 1 && !isFinalTable;

  const finalTableFallingParticles = useMemo<FallingParticle[]>(() => {
    if (!isFinalTable) return [];

    if (finalTableFallPhase === "continuous") {
      return createFallParticles(
        FINAL_TABLE_OBJECT_GROUPS.all,
        FALL_OBJECT_COUNT,
        FALL_OBJECT_DURATION_S * 5,
        FALL_OBJECT_DURATION_S,
        "ft-continuous",
      );
    }

    if (finalTableFallPhase !== "scripted") return [];

    const scriptedConfigs: Record<
      ScriptedFallSegment,
      { assets: readonly FallAsset[]; count: number; spawnWindowS: number; durationS: number }
    > = {
      trophy: { assets: FINAL_TABLE_OBJECT_GROUPS.trophy, count: 10, spawnWindowS: 5, durationS: 6.5 },
      chips: { assets: FINAL_TABLE_OBJECT_GROUPS.chips, count: 18, spawnWindowS: 6, durationS: 7 },
      money: { assets: FINAL_TABLE_OBJECT_GROUPS.money, count: 14, spawnWindowS: 5.5, durationS: 7 },
      all: { assets: FINAL_TABLE_OBJECT_GROUPS.all, count: 28, spawnWindowS: 7, durationS: 7.5 },
    };

    const config = scriptedConfigs[scriptedSegment];

    return createFallParticles(
      config.assets,
      config.count,
      config.spawnWindowS,
      config.durationS,
      `ft-script-${scriptCycleKey}-${scriptedSegment}-${scriptWaveKey}`,
      true,
    );
  }, [isFinalTable, finalTableFallPhase, scriptedSegment, scriptCycleKey, scriptWaveKey]);

  useEffect(() => {
    if (!isFinalTable) {
      setFinalTableFallPhase("scripted");
      setScriptedSegment("trophy");
      setScriptCycleKey(0);
      setScriptWaveKey(0);
    }
  }, [isFinalTable]);

  useEffect(() => {
    if (!isFinalTable || finalTableFallPhase !== "scripted") return;

    let cancelled = false;
    const timeouts: number[] = [];

    const runCycle = (cycle: number) => {
      if (cancelled) return;

      setScriptCycleKey(cycle);

      SCRIPTED_SEGMENTS.forEach((segment, index) => {
        timeouts.push(
          window.setTimeout(() => {
            if (cancelled) return;
            setScriptedSegment(segment);
            setScriptWaveKey((key) => key + 1);
          }, index * SCRIPTED_SEGMENT_MS),
        );
      });

      timeouts.push(
        window.setTimeout(() => {
          if (cancelled) return;
          runCycle(cycle + 1);
        }, SCRIPTED_SEGMENTS.length * SCRIPTED_SEGMENT_MS),
      );
    };

    runCycle(0);

    return () => {
      cancelled = true;
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [isFinalTable, finalTableFallPhase]);

  const isITM = remainingPlayersCount <= payouts.length && payouts.length > 0;
  const nextPayoutRank = isITM ? Math.max(1, remainingPlayersCount - 1) : payouts.length;
  const nextPayoutObj = payouts.find(p => p.rank === nextPayoutRank);
  const nextPayoutAmount = nextPayoutObj ? nextPayoutObj.amount : 0;

  // Fullscreen milestone overlay + audio (bubble / final table)
  useEffect(() => {
    const prevCount = prevRemainingCountRef.current;
    const bubbleThreshold = payouts.length > 0 ? payouts.length + 1 : null;

    const stopMilestoneAudio = () => {
      clearMilestoneOverlayTimeout();
      if (milestoneAudioRef.current) {
        milestoneAudioRef.current.pause();
        milestoneAudioRef.current.currentTime = 0;
        milestoneAudioRef.current = null;
      }
      milestonePausedByMuteRef.current = false;
    };

    const closeMilestoneOverlay = (type: "bubble" | "final") => {
      clearMilestoneOverlayTimeout();
      milestonePausedByMuteRef.current = false;
      milestoneAudioRef.current = null;
      setMilestoneOverlay((current) => (current === type ? null : current));
      if (type === "final") {
        setFinalTableFallPhase("scripted");
        setScriptedSegment("trophy");
        setScriptWaveKey((key) => key + 1);
      }
    };

    const scheduleOverlayClose = (type: "bubble" | "final", audio: HTMLAudioElement) => {
      const schedule = (durationSeconds: number) => {
        clearMilestoneOverlayTimeout();
        milestoneOverlayTimeoutRef.current = setTimeout(() => {
          closeMilestoneOverlay(type);
        }, durationSeconds * 1000 + 250);
      };

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        schedule(audio.duration);
        return;
      }

      audio.addEventListener(
        "loadedmetadata",
        () => {
          schedule(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30);
        },
        { once: true }
      );

      milestoneOverlayTimeoutRef.current = setTimeout(() => {
        if (milestoneOverlayRef.current === type) {
          closeMilestoneOverlay(type);
        }
      }, 30000);
    };

    const playMilestone = (type: "bubble" | "final") => {
      stopMilestoneAudio();
      setMilestoneOverlay(type);
      if (type === "final") {
        setFinalTableFallPhase("continuous");
      }

      const audio = new Audio(MILESTONE_ASSETS[type].audio);
      audio.preload = "auto";
      milestoneAudioRef.current = audio;
      milestonePausedByMuteRef.current = false;
      registerActiveAudio(audio);

      const handleMilestoneEnded = () => {
        closeMilestoneOverlay(type);
      };

      audio.addEventListener("ended", handleMilestoneEnded, { once: true });
      scheduleOverlayClose(type, audio);

      if (soundEnabledRef.current) {
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch((err) => {
            console.warn(`Could not play ${MILESTONE_ASSETS[type].audio}:`, err);
          });
        }
      }
    };

    if (isFinalTable && prevCount !== FINAL_TABLE_PLAYERS) {
      playMilestone("final");
    } else if (isBubbleTime && bubbleThreshold !== null && prevCount !== bubbleThreshold) {
      playMilestone("bubble");
    }

    if (!isFinalTable && !isBubbleTime) {
      setMilestoneOverlay(null);
      stopMilestoneAudio();
    }

    prevRemainingCountRef.current = remainingPlayersCount;
  }, [isBubbleTime, isFinalTable, remainingPlayersCount, payouts.length, registerActiveAudio, clearMilestoneOverlayTimeout]);

  // Average Stack calculation
  const totalChipsInPlay = players.reduce((sum, p) => sum + p.chips, 0);
  const averageStack = remainingPlayersCount > 0 ? Math.round(totalChipsInPlay / remainingPlayersCount) : 0;
  const bigBlind = activeLevel.bigBlind || 1;
  const averageBB = Math.round(averageStack / bigBlind);

  // Time remaining on next break calculation
  const calculateTimeToNextBreak = () => {
    let secs = 0;
    // Sum remaining time of current level
    secs += clock.timeRemaining;
    
    // Sum times of upcoming levels until a break is found
    for (let i = clock.currentLevelIndex + 1; i < settings.blindStructure.length; i++) {
      const lvl = settings.blindStructure[i];
      if (lvl.isBreak) {
        break;
      }
      secs += lvl.duration * 60;
    }
    return formatHHMMSS(secs);
  };

  const levelsUntilBreak = () => {
    let count = 0;
    for (let i = clock.currentLevelIndex + 1; i < settings.blindStructure.length; i++) {
      const lvl = settings.blindStructure[i];
      if (lvl.isBreak) {
        return count;
      }
      count++;
    }
    return count;
  };

  const currentStandardLevel = settings.blindStructure
    .slice(0, clock.currentLevelIndex + 1)
    .filter(l => !l.isBreak)
    .pop()?.level || 1;

  const isLateRegOpen = currentStandardLevel <= (settings.lateRegLevel ?? 7);

  // Dynamic progress calculation for next break
  const getNextBreakProgress = () => {
    if (activeLevel.isBreak) return 100;
    
    // Find previous break index
    let prevBreakIdx = -1;
    for (let i = clock.currentLevelIndex; i >= 0; i--) {
      if (settings.blindStructure[i]?.isBreak) {
        prevBreakIdx = i;
        break;
      }
    }
    
    // Find next break index
    let nextBreakIdx = settings.blindStructure.length;
    for (let i = clock.currentLevelIndex; i < settings.blindStructure.length; i++) {
      if (settings.blindStructure[i]?.isBreak) {
        nextBreakIdx = i;
        break;
      }
    }
    
    // Sum total duration of all levels in this block
    let totalSecs = 0;
    for (let i = prevBreakIdx + 1; i < nextBreakIdx; i++) {
      totalSecs += (settings.blindStructure[i]?.duration || 0) * 60;
    }
    
    // Sum remaining seconds to next break
    let secsRemaining = clock.timeRemaining;
    for (let i = clock.currentLevelIndex + 1; i < nextBreakIdx; i++) {
      secsRemaining += (settings.blindStructure[i]?.duration || 0) * 60;
    }
    
    if (totalSecs <= 0) return 0;
    const elapsedSecs = totalSecs - secsRemaining;
    return Math.max(0, Math.min(100, (elapsedSecs / totalSecs) * 100));
  };

  const nextBreakProgressPercent = getNextBreakProgress();

  // Progress circle circumference calculation (radius = 160)
  const radius = 160;
  const circumference = 2 * Math.PI * radius;
  const totalLevelSeconds = activeLevel.duration * 60;
  const progressPercent = totalLevelSeconds > 0 ? (clock.timeRemaining / totalLevelSeconds) : 0;
  const strokeDashoffset = circumference - (progressPercent * circumference);

  const getProgressColor = () => {
    if (activeLevel.isBreak) return "#3b82f6"; // Blue during break
    const elapsedPercent = totalLevelSeconds > 0 ? ((totalLevelSeconds - clock.timeRemaining) / totalLevelSeconds) * 100 : 0;
    
    if (elapsedPercent < 50) {
      return "#10b981"; // Green
    } else if (elapsedPercent >= 50 && elapsedPercent < 70) {
      return "#f97316"; // Orange
    } else if (elapsedPercent >= 70 && elapsedPercent < 95) {
      return "#eab308"; // Yellow
    } else {
      return "#ef4444"; // Red
    }
  };
  const activeColor = getProgressColor();

  // Fullscreen trigger
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error enabling fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => updateDisplayScale();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", handleFullscreenChange);
    window.addEventListener("display-settings-changed", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", handleFullscreenChange);
      window.removeEventListener("display-settings-changed", handleFullscreenChange);
    };
  }, [updateDisplayScale]);

  useEffect(() => {
    if (!pendingFullscreen) return;
    const timer = window.setTimeout(() => {
      containerRef.current?.requestFullscreen().catch((err) => {
        console.error(`Error enabling display fullscreen: ${err.message}`);
      });
      onFullscreenHandled?.();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [pendingFullscreen, onFullscreenHandled]);

  // Scroll payouts carousel by page of 14
  const nextPayout = () => {
    if (payouts.length > 14) {
      setPayoutOffset((prev) => {
        const next = prev + 14;
        return next >= payouts.length ? 0 : next;
      });
    }
  };

  const prevPayout = () => {
    if (payouts.length > 14) {
      setPayoutOffset((prev) => {
        const next = prev - 14;
        return next < 0 ? Math.floor((payouts.length - 1) / 14) * 14 : next;
      });
    }
  };

  // Keyboard Space key toggles pause/play
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (clock.isRunning) {
          pauseTimer();
        } else {
          startTimer();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clock.isRunning, startTimer, pauseTimer]);

  const payoutPageCount = Math.ceil(payouts.length / PAYOUTS_PER_PAGE);
  const visiblePayouts = payouts.slice(payoutOffset, payoutOffset + PAYOUTS_PER_PAGE);
  const payoutRangeStart = payouts.length > 0 ? payoutOffset + 1 : 0;
  const payoutRangeEnd = Math.min(payoutOffset + PAYOUTS_PER_PAGE, payouts.length);

  const getRankLabel = (rank: number) => {
    const ranks = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH", "11TH", "12TH"];
    return ranks[rank - 1] || `${rank}TH`;
  };

  return (
    <div 
      ref={containerRef} 
      id="clock-container"
      className={isDisplayFullscreen ? "clock-fullscreen-viewport" : "flex flex-col bg-zinc-950 text-zinc-100 p-4 md:p-5 font-sans select-none min-h-screen relative"}
    >
      <div
        id="clock-display-stage"
        className={isDisplayFullscreen
          ? "clock-fullscreen-stage relative flex flex-col overflow-hidden p-4 md:p-5"
          : "relative flex flex-col flex-1 w-full min-h-full"}
        style={isDisplayFullscreen ? {
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `translate(-50%, -50%) scale(${displayScale})`,
        } : undefined}
      >
      {isFinalTable && (finalTableFallPhase === "continuous" || finalTableFallPhase === "scripted") && (
        <div className="final-table-fall-layer absolute inset-0 overflow-hidden pointer-events-none z-[6]" aria-hidden="true">
          {finalTableFallingParticles.map((particle) => (
            <img
              key={
                finalTableFallPhase === "scripted"
                  ? `${scriptCycleKey}-${scriptedSegment}-${scriptWaveKey}-${particle.id}`
                  : particle.id
              }
              src={particle.src}
              alt=""
              className={`final-table-falling-object absolute${
                finalTableFallPhase === "scripted" ? " final-table-falling-object--once" : ""
              }`}
              style={{
                left: particle.left,
                width: `${particle.size}px`,
                height: "auto",
                animationDuration: `${particle.durationS}s`,
                animationDelay: particle.delay,
                ["--fall-drift" as string]: particle.drift,
              }}
              draggable={false}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes rapid-blink {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 10px rgba(239, 68, 68, 0.8)); }
          50% { opacity: 0.2; filter: none; }
        }
        .animate-rapid-blink {
          animation: rapid-blink 0.5s infinite;
        }
      `}</style>
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2 mb-4 shrink-0" id="clock-header">
        {/* Branding & Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-full border border-yellow-500/80 bg-black shadow-lg shadow-yellow-500/5 shrink-0">
            <span className="text-[22.5px] font-black text-yellow-500">🏆</span>
          </div>
          <div className="shrink-0">
            <h2 className="text-[15px] font-bold tracking-widest text-zinc-400 leading-none">TOURNAMENT MASTER</h2>
            <p className="text-[12.5px] text-yellow-500 font-mono tracking-wider uppercase font-medium mt-0.5">POKERCLUP.COM</p>
          </div>
          <div className="ml-2 bg-zinc-950 border border-amber-500/30 rounded-xl px-3 py-1 flex flex-col items-center justify-center min-w-[90px] select-none shrink-0" style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
            <div className="flex items-center gap-1 justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse"></span>
              <span className="text-[12.5px] font-black tracking-widest text-emerald-500 uppercase">LIVE</span>
            </div>
            {settings.isMultiDay && settings.totalDays && settings.totalDays > 0 ? (
              <span className="text-[15px] font-black text-amber-500 tracking-wide mt-0.5">
                Day {settings.currentDay || 1} of {settings.totalDays}
              </span>
            ) : null}
          </div>
        </div>

        {/* Tournament Name Header */}
        <div className="text-left flex-1 px-4 max-w-md min-w-[150px]">
          <p className="text-[11.25px] text-zinc-500 font-mono uppercase tracking-widest leading-none">EVENT NAME</p>
          <h1 className="text-[20px] font-black tracking-tight uppercase truncate mt-0.5">{settings.name || "Summer Poker Championship"}</h1>
        </div>

        {/* Center-Right Metadata Info */}
        <div className="flex items-center gap-4 text-[15px] font-mono shrink-0">
          <div className="text-right">
            <p className="text-[11.25px] text-zinc-500 uppercase leading-none">START TIME</p>
            <p className="font-bold text-zinc-400 text-[15px] mt-0.5">14:00, May 26, 2025</p>
          </div>
          <div className="text-right border-l border-zinc-800 pl-3">
            <p className="text-[11.25px] text-zinc-500 uppercase leading-none">ELAPSED TIME</p>
            <p className="font-bold text-amber-500 text-[15px] mt-0.5 tracking-wider">{formattedElapsed}</p>
          </div>
          <div className="text-right border-l border-zinc-800 pl-3">
            <p className="text-[11.25px] text-zinc-500 uppercase leading-none">CURRENT TIME</p>
            <p className="font-bold text-emerald-400 text-[15px] mt-0.5 tracking-wider">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </p>
          </div>
        </div>

        {/* Top Control Action Buttons */}
        <div className="flex items-center gap-1.5 border-l border-zinc-800 pl-3 opacity-10 hover:opacity-100 focus-within:opacity-100 transition-all duration-300 shrink-0">
          <button 
            id="sound-toggle-btn"
            onClick={() => toggleSound()}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-zinc-300 hover:text-zinc-100"
            title={clock.soundEnabled ? "Mute Sound Alerts" : "Enable Sound Alerts"}
            aria-pressed={!clock.soundEnabled}
            aria-label={clock.soundEnabled ? "Mute sound alerts" : "Enable sound alerts"}
          >
            {clock.soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-red-400" />}
          </button>
          <button 
            id="reset-db-btn"
            onClick={() => setShowResetConfirm(true)}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-zinc-300 hover:text-zinc-100"
            title="Reset Tournament Data to Defaults"
            aria-label="Reset tournament data to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
          </button>
          <button 
            id="fullscreen-toggle-btn"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition text-zinc-300 hover:text-zinc-100"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 items-stretch">
        
        {/* LEFT COLUMN: Players, Average Stack, Prize Pool (Columns spans 3) */}
        <div className="lg:col-span-3 flex flex-col gap-5 justify-between">
          
          {/* PLAYERS PANEL */}
          <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-5 shadow-lg flex flex-col justify-between flex-1 relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              PLAYERS
            </div>
            <div className="grid grid-cols-3 gap-3 my-auto">
              <div>
                <p className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-zinc-100">{totalPlayers}</p>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">TOTAL</p>
              </div>
              <div className="border-l border-zinc-800 pl-3">
                <p className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-emerald-400">{remainingPlayersCount}</p>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">REMAINING</p>
              </div>
              <div className="border-l border-zinc-800 pl-3">
                <p className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-amber-500">{tables ? tables.length : 0}</p>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">ACTIVE TABLES</p>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full blur-2xl"></div>
          </div>

          {/* AVERAGE STACK PANEL */}
          <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-5 shadow-lg flex flex-col justify-between flex-1 relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              AVERAGE STACK
            </div>
            <div className="my-auto space-y-4">
              <div>
                <p className="text-3xl md:text-4xl font-black tracking-tight text-zinc-100 font-sans">
                  {averageBB} BB <span className="text-zinc-500 text-xl font-medium">/</span> <span className="text-amber-500">{averageStack.toLocaleString("de-DE")}</span>
                </p>
              </div>
              <div className="border-t border-zinc-800/60 pt-3">
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">TOTAL CHIPS</p>
                <p className="text-2xl font-black text-emerald-400 font-sans tracking-tight">{totalChipsInPlay.toLocaleString("de-DE")}</p>
              </div>
            </div>
          </div>

          {/* PRIZE POOL PANEL */}
          <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-5 shadow-lg flex flex-col justify-between flex-1 relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              PRIZE POOL
            </div>
            <div className="my-auto space-y-3">
              <div>
                <p className="text-3xl md:text-4xl font-black font-mono tracking-tight text-zinc-100">${totalPrizePool.toLocaleString()}</p>
              </div>

              {isITM && (
                <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl shadow-[inset_0_0_8px_rgba(16,185,129,0.05)] w-full justify-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">
                    IN THE MONEY
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2.5">
                <div>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider leading-none">PLACES PAID</p>
                  <p className="text-base font-black text-zinc-100 mt-1">{payouts.length}</p>
                </div>
                <div className="border-l border-zinc-800/60 pl-3">
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider leading-none">NEXT PAY</p>
                  <p className="text-base font-black text-amber-500 mt-1">
                    {nextPayoutAmount > 0 ? `$${nextPayoutAmount.toLocaleString()}` : "-"}
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-3xl"></div>
          </div>

        </div>

        {/* CENTER COLUMN: The Circular Clock (Columns spans 6) - STABLE / NO BLINK ON ELIMINATION */}
        <div
          className={`lg:col-span-6 flex flex-col items-center rounded-3xl relative overflow-hidden transition-all duration-700 ${
            isDisplayFullscreen && isFinalTable
              ? "justify-start px-8 pb-8"
              : "justify-center p-8"
          } ${
            isFinalTable
              ? "final-table-clock-container bg-gradient-to-b from-amber-950/55 via-amber-900/30 to-amber-950/20 border-2 border-amber-500/55 shadow-2xl shadow-amber-500/25"
              : isBubbleTime
              ? "bg-gradient-to-b from-red-950/40 via-zinc-900 to-zinc-900 border-2 border-red-500/40 shadow-2xl shadow-red-500/15"
              : "bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/60"
          }`}
        >
          {milestoneOverlay && (
            <div
              className="absolute bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-end justify-center pointer-events-none w-[95%] max-w-[680px] h-[180px] sm:h-[228px] lg:h-[294px]"
              aria-hidden="true"
            >
              <img
                src={MILESTONE_ASSETS[milestoneOverlay].image}
                alt={MILESTONE_ASSETS[milestoneOverlay].label}
                className="max-w-full max-h-full w-auto h-auto object-contain object-bottom drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
                draggable={false}
              />
            </div>
          )}

          {/* Radial BG glow */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full blur-3xl pointer-events-none transition-all duration-500 ${
            isFinalTable
              ? "opacity-70 bg-gradient-to-tr from-amber-400/25 to-yellow-500/15"
              : isBubbleTime
              ? "opacity-55 bg-gradient-to-tr from-red-500/20 to-amber-500/10"
              : "opacity-45 bg-gradient-to-tr from-amber-500/[0.0375] to-red-500/[0.0375]"
          }`}></div>

          {/* Milestone label directly above the round clock */}
          {isFinalTable && isDisplayFullscreen && (
            <>
              <img
                src="/champion.png"
                alt=""
                aria-hidden="true"
                className="absolute left-1 sm:left-2 top-4 z-20 shrink-0 w-[88px] sm:w-32 lg:w-[152px] h-auto max-h-[160px] sm:max-h-[220px] lg:max-h-[260px] object-contain object-center drop-shadow-[0_4px_18px_rgba(245,158,11,0.4)] pointer-events-none"
                draggable={false}
              />
              <img
                src="/champion.png"
                alt=""
                aria-hidden="true"
                className="absolute right-1 sm:right-2 top-4 z-20 shrink-0 w-[88px] sm:w-32 lg:w-[152px] h-auto max-h-[160px] sm:max-h-[220px] lg:max-h-[260px] object-contain object-center drop-shadow-[0_4px_18px_rgba(245,158,11,0.4)] pointer-events-none scale-x-[-1]"
                draggable={false}
              />
            </>
          )}

          <div
            className={`relative z-10 w-full flex flex-col items-center shrink-0 ${
              isFinalTable && isDisplayFullscreen ? "pt-[25px]" : ""
            }`}
          >
            {isFinalTable && !isDisplayFullscreen && (
              <div className="w-full flex items-center justify-center gap-3 sm:gap-4 lg:gap-5">
                <img
                  src="/champion.png"
                  alt=""
                  aria-hidden="true"
                  className="shrink-0 w-[88px] sm:w-32 lg:w-[152px] h-auto max-h-[160px] sm:max-h-[220px] lg:max-h-[260px] object-contain object-center drop-shadow-[0_4px_18px_rgba(245,158,11,0.4)] pointer-events-none"
                  draggable={false}
                />
                <div className="relative shrink-0">
                  <div className="final-table-title-spotlight" aria-hidden="true" />
                  <p className="relative z-[2] text-[30px] sm:text-[36px] font-black tracking-[0.3em] text-amber-400 uppercase text-center leading-none">
                    {MILESTONE_ASSETS.final.label}
                  </p>
                </div>
                <img
                  src="/champion.png"
                  alt=""
                  aria-hidden="true"
                  className="shrink-0 w-[88px] sm:w-32 lg:w-[152px] h-auto max-h-[160px] sm:max-h-[220px] lg:max-h-[260px] object-contain object-center drop-shadow-[0_4px_18px_rgba(245,158,11,0.4)] pointer-events-none scale-x-[-1]"
                  draggable={false}
                />
              </div>
            )}
            {isFinalTable && isDisplayFullscreen && (
              <div className="relative shrink-0">
                <div className="final-table-title-spotlight" aria-hidden="true" />
                <p className="relative z-[2] text-[30px] sm:text-[36px] font-black tracking-[0.3em] text-amber-400 uppercase text-center leading-none">
                  {MILESTONE_ASSETS.final.label}
                </p>
              </div>
            )}
            {isBubbleTime && !isFinalTable && (
              <p className="mb-5 text-xl sm:text-2xl font-black tracking-[0.35em] text-red-400 uppercase text-center">
                {MILESTONE_ASSETS.bubble.label}
              </p>
            )}

            {/* TIMER PROGRESS DISPLAY RING */}
            <div
              className={`relative w-[300px] h-[300px] sm:w-[380px] sm:h-[380px] lg:w-[490px] lg:h-[490px] flex items-center justify-center ${
                isFinalTable ? "mt-1" : ""
              }`}
              id="main-timer-ring"
            >

            {/* SVG Track ring */}
            <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 360 360">
              
              {/* Clean uniform background track circle */}
              <circle
                cx="180"
                cy="180"
                r="160"
                fill="transparent"
                stroke="#18181b"
                strokeWidth="14"
                className="stroke-zinc-800/60"
              />

              {/* PROGRESS OVERLAYS (Bright glowing stroke) */}
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <circle
                cx="180"
                cy="180"
                r="160"
                fill="transparent"
                stroke={activeColor}
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                filter="url(#glow)"
                className="transition-all duration-1000 ease-linear"
              />
            </svg>

            {/* Inner Content Block */}
            <div 
              className="flex flex-col items-center justify-center text-center z-10 w-[230px] h-[230px] sm:w-[290px] sm:h-[290px] lg:w-[375px] lg:h-[375px] rounded-full bg-zinc-950/98 border border-zinc-800 shadow-inner transition-all duration-500"
              style={{
                boxShadow: `inset 0 4px 20px rgba(0,0,0,0.9), 0 0 19px ${activeColor}10`
              }}
            >
              <span 
                className="font-black uppercase tracking-widest font-mono mb-1 transition-colors duration-500 text-[11px] sm:text-[13px] lg:text-[17px]"
                style={{ color: activeColor }}
              >
                {activeLevel.isBreak ? "BREAK" : `LEVEL ${activeLevel.level}`}
              </span>
              
              <h1 className="text-4xl sm:text-5xl lg:text-[78px] font-black font-mono tracking-tighter text-zinc-100 select-all leading-none py-1.5 sm:py-2">
                {formatTime(clock.timeRemaining)}
              </h1>

              <div className="w-12 sm:w-16 lg:w-24 h-[1.5px] bg-zinc-850 my-1.5 sm:my-2 lg:my-3.5"></div>

              <p className="text-zinc-500 font-extrabold uppercase tracking-widest text-[9px] sm:text-[11px] lg:text-[15px]">BLINDS</p>
              
              <p className="text-base sm:text-xl lg:text-[30px] font-black tracking-tight text-zinc-100 mt-1">
                {activeLevel.isBreak ? "REST TIME" : `${activeLevel.smallBlind.toLocaleString()} / ${activeLevel.bigBlind.toLocaleString()}`}
              </p>
              
              {!activeLevel.isBreak && activeLevel.ante > 0 && (
                <p 
                  className="font-black uppercase tracking-wider font-mono mt-1 sm:mt-1.5 lg:mt-2 transition-colors duration-500 text-[10px] sm:text-[12px] lg:text-[17px]"
                  style={{ color: activeColor }}
                >
                  ANTE {activeLevel.ante.toLocaleString()}
                </p>
              )}
            </div>
          </div>
          </div>

          {/* TIMER CONTROL ACTIONS ROW */}
          <div className="relative z-10 flex items-center justify-center gap-4 mt-6 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-all duration-300 min-h-[56px]">
            {/* Level Backward */}
            <button
              onClick={() => setLevel(Math.max(0, clock.currentLevelIndex - 1))}
              disabled={clock.currentLevelIndex === 0}
              className="transition-all duration-300 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-600 disabled:opacity-30 text-zinc-500 hover:text-zinc-100 shrink-0"
              title="Previous Level (Back)"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => adjustTime(-60)}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-600 transition text-xs font-bold font-mono hover:text-zinc-100 text-zinc-400"
              title="Subtract 1 Minute"
            >
              -1m
            </button>
            <button
              onClick={clock.isRunning ? pauseTimer : startTimer}
              className={`p-4 rounded-full flex items-center justify-center border transition-all shadow-lg ${
                clock.isRunning 
                  ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30 shadow-red-500/5 hover:scale-105" 
                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/5 hover:scale-105"
              }`}
            >
              {clock.isRunning ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
            </button>
            <button
              onClick={() => adjustTime(60)}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-600 transition text-xs font-bold font-mono hover:text-zinc-100 text-zinc-400"
              title="Add 1 Minute"
            >
              +1m
            </button>

            {/* Level Forward */}
            <button
              onClick={() => setLevel(Math.min(settings.blindStructure.length - 1, clock.currentLevelIndex + 1))}
              disabled={clock.currentLevelIndex === settings.blindStructure.length - 1}
              className="transition-all duration-300 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-600 disabled:opacity-30 text-zinc-500 hover:text-zinc-100 shrink-0"
              title="Next Level (Forward)"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Next Level, Next Break, Live Feed (Columns spans 3) */}
        <div className="lg:col-span-3 flex flex-col gap-3 justify-between min-h-0">
          
          {/* NEXT LEVEL PANEL */}
          <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-5 shadow-lg flex flex-col justify-between shrink-0 relative overflow-hidden group hover:border-zinc-700 transition">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              NEXT LEVEL
            </div>
            {nextLevel ? (
              <div className="my-auto space-y-3">
                <div>
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">
                    {nextLevel.isBreak ? "BREAK TIME" : `LEVEL ${nextLevel.level}`}
                  </p>
                  <p className="text-3xl md:text-4xl font-black font-mono tracking-tight text-zinc-100">
                    {nextLevel.isBreak ? `${nextLevel.duration} MIN` : `${nextLevel.smallBlind.toLocaleString()} / ${nextLevel.bigBlind.toLocaleString()}`}
                  </p>
                  {nextLevel.isBreak && (
                    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">BREAK</p>
                  )}
                </div>
                {!nextLevel.isBreak && nextLevel.ante > 0 && (
                  <div className="border-t border-zinc-800/60 pt-3">
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">ANTE</p>
                    <p className="text-2xl font-black font-mono tracking-tight transition-colors duration-500" style={{ color: activeColor }}>
                      {nextLevel.ante.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest my-auto">FINAL LEVEL REACHED</p>
            )}
          </div>

          <div className="flex gap-3 shrink-0 items-stretch">
            {/* NEXT BREAK PANEL */}
            <div className={`bg-zinc-900/40 rounded-2xl border border-zinc-800 p-3 shadow-lg flex flex-col shrink-0 relative overflow-hidden group hover:border-zinc-700 transition ${
              hasSeatedActivePlayers ? "w-1/2 min-w-0" : "w-full"
            }`}>
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                NEXT BREAK
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                  IN {levelsUntilBreak()} LEVEL{levelsUntilBreak() !== 1 && "S"}
                </p>
                <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden mb-2 border border-zinc-850">
                  <div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{ width: `${nextBreakProgressPercent}%` }}></div>
                </div>
                <p className="text-xl font-black font-mono tracking-tight text-zinc-100">{calculateTimeToNextBreak()}</p>
              </div>
            </div>

            {hasSeatedActivePlayers && (
              <div className="w-1/2 min-w-0 flex items-center justify-center pointer-events-none">
                <TrackingQrCode compact />
              </div>
            )}
          </div>

          {/* LIVE EVENT FEED VERTICAL CARD */}
          <div
            key={isDisplayFullscreen ? "live-feed-fullscreen" : "live-feed-normal"}
            className={`bg-zinc-900/40 rounded-2xl border border-zinc-800 p-4 shadow-lg flex flex-col relative overflow-hidden group hover:border-zinc-700 transition ${
              isDisplayFullscreen ? "flex-1 min-h-0" : "min-h-[280px] shrink-0"
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3 shrink-0">
              <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                LIVE FEED
              </div>
              <div className="flex items-center gap-1.5 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/20">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-[9px] font-black tracking-widest text-red-500 uppercase">LIVE</span>
              </div>
            </div>

            {/* Last 3 actions only */}
            <div className={`flex flex-col gap-3 ${
              isDisplayFullscreen ? "flex-1 justify-center min-h-0" : "flex-none"
            }`}>
              {history.slice(0, 3).map((evt) => {
                const colors = {
                  registration: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                  bust: "text-red-400 bg-red-500/10 border-red-500/20",
                  rebuy: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
                  reentry: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                  balance: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                  undo: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
                  clock: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
                  level: "text-orange-400 bg-orange-500/10 border-orange-500/20",
                  settings: "text-teal-400 bg-teal-500/10 border-teal-500/20",
                  move: "text-violet-400 bg-violet-500/10 border-violet-500/20",
                  seating: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
                  addon: "text-pink-400 bg-pink-500/10 border-pink-500/20",
                  disqualify: "text-purple-400 bg-purple-500/10 border-purple-500/20"
                };

                const labels = {
                  registration: "👤",
                  bust: "💀",
                  rebuy: "💰",
                  reentry: "🔄",
                  balance: "⚖️",
                  undo: "↩️",
                  clock: "⏱️",
                  level: "📈",
                  settings: "⚙️",
                  move: "↔️",
                  seating: "🪑",
                  addon: "➕",
                  disqualify: "🚫"
                };

                const isBlinking = blinkingEvents[evt.id] !== undefined;
                const isBust = evt.type === 'bust';
                
                let displayName = evt.playerName || "";
                let displayAction = "";
                
                if (isBust) {
                  if (!displayName) {
                    const suffixIndex = evt.description.toLowerCase().indexOf(" eliminated");
                    if (suffixIndex !== -1) {
                      displayName = evt.description.substring(0, suffixIndex);
                      displayAction = "eliminated";
                    } else {
                      displayName = evt.description;
                    }
                  } else {
                    displayAction = "eliminated";
                  }
                }

                return (
                  <div key={evt.id} className={`flex gap-3.5 items-center text-base border-b border-zinc-900/50 pb-3 last:border-0 last:pb-0 ${isBlinking ? "bg-red-950/20 p-2.5 rounded-xl border border-red-900/30 transition-all duration-300 shadow-[inset_0_0_8px_rgba(239,68,68,0.1)]" : ""}`}>
                    <span className={`w-8 h-8 flex items-center justify-center rounded-lg border text-lg shrink-0 ${isBlinking ? "animate-rapid-blink border-red-500 bg-red-500/25 text-red-100" : (colors[evt.type] || colors.undo)}`}>
                      {labels[evt.type] || "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      {isBust ? (
                        <p className="text-zinc-100 font-medium leading-snug">
                          <span className={`font-black tracking-wide ${isBlinking ? "animate-rapid-blink text-red-400 text-lg bg-red-900/40 px-1.5 py-0.5 rounded border border-red-500/20 mr-1" : "text-red-400 text-base"}`}>
                            {displayName}
                          </span>
                          <span className={`text-sm ${isBlinking ? "text-zinc-300 font-bold" : "text-zinc-400"}`}>
                            {displayAction}
                          </span>
                        </p>
                      ) : (
                        <p className="text-zinc-100 font-semibold leading-snug text-base">{evt.description}</p>
                      )}
                      <p className="text-sm text-zinc-500 mt-1">{new Date(evt.timestamp).toLocaleTimeString()}</p>
                    </div>
                  </div>
                );
              })}
              {history.length === 0 && (
                <div className="text-center py-4 text-zinc-500 uppercase text-sm font-bold">No active events logged</div>
              )}
            </div>

            <div className={`flex items-center justify-end border-t border-zinc-800 pt-4 shrink-0 ${
              isDisplayFullscreen ? "mt-auto" : "mt-3"
            }`}>
              <button 
                onClick={undoLastHistory}
                className="text-xs text-zinc-400 font-bold hover:text-zinc-100 uppercase transition tracking-wide"
              >
                UNDO LAST ACTION &gt;
              </button>
            </div>
          </div>

        </div>

      </div>



      {isDisplayFullscreen && (
      <>
      {/* TOURNAMENT LEVELS TIMELINE (REPOSITIONED BELOW THE CLOCK GRID WITH INLINE LATE REGISTRATION) */}
      <div className="bg-zinc-900/40 rounded-2xl p-3.5 pb-2.5 shadow-lg mt-2 mb-0 overflow-hidden" id="timeline-card">
        {/* Stepper timeline row with LEVEL info and late registration inline */}
        <div className="flex flex-wrap md:flex-nowrap items-start gap-6 overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-zinc-800">
          
          {/* INLINE STATUS BADGES */}
          <div className="flex items-center gap-[16.8px] shrink-0 bg-zinc-950/60 px-[14.4px] py-[9.6px] rounded-[14.4px] border border-zinc-850 select-none mt-[15px]">
            <div className="text-zinc-500 text-[18px] font-black uppercase tracking-[0.2em]">
              LEVELS
            </div>
            <div className="w-px h-[28.8px] bg-zinc-800"></div>
            <div className="flex flex-col justify-center text-left">
              <span className="text-[12px] text-zinc-500 font-extrabold uppercase tracking-widest leading-none">
                LATE REGISTRATION
              </span>
              <span className={`text-[15px] font-black tracking-wider uppercase flex items-center gap-[7.2px] mt-[4.8px] leading-none ${isLateRegOpen ? "text-emerald-400" : "text-red-500"}`}>
                LVL {settings.lateRegLevel ?? 7} / {isLateRegOpen ? "OPEN" : "CLOSED"}
                <span className={`w-[7.2px] h-[7.2px] rounded-full ${isLateRegOpen ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
              </span>
            </div>
          </div>

          <div className="flex-1 flex items-start justify-between gap-1 relative min-w-[700px] mt-0.5">
            {(() => {
              const totalLevelsCount = settings.blindStructure.length;
              let startIdx = 0;
              const maxVisible = 9; // Reduced by one level to accommodate the inline metadata beautifully
              if (clock.currentLevelIndex >= 4) {
                startIdx = clock.currentLevelIndex - 4;
              }
              if (startIdx + maxVisible > totalLevelsCount) {
                startIdx = Math.max(0, totalLevelsCount - maxVisible);
              }

              const visibleLevelsWithIndices = settings.blindStructure
                .map((lvl, idx) => ({ lvl, originalIndex: idx }))
                .slice(startIdx, startIdx + maxVisible);

              return visibleLevelsWithIndices.map(({ lvl, originalIndex }, itemIndex) => {
                const isCompleted = originalIndex < clock.currentLevelIndex;
                const isActive = originalIndex === clock.currentLevelIndex;
                const isFuture = originalIndex > clock.currentLevelIndex;

                return (
                  <div
                    key={originalIndex}
                    onClick={() => setLevel(originalIndex)}
                    className="flex flex-col items-center cursor-pointer relative flex-1 group"
                  >
                    {/* Connection line behind the circles */}
                    {itemIndex < visibleLevelsWithIndices.length - 1 && (
                      <div
                        className={`absolute top-[18px] left-1/2 w-full h-[3px] -translate-y-1/2 z-0 ${
                          isCompleted ? "bg-emerald-500" : "bg-zinc-800"
                        }`}
                      ></div>
                    )}

                    {/* Circle icon */}
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-[2.5px] transition-all duration-300 z-10 ${
                        isCompleted
                          ? "bg-emerald-500 border-emerald-600 text-zinc-950 font-black"
                          : isActive
                          ? "bg-zinc-950 border-amber-500 text-amber-400 ring-4 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.5)] scale-110"
                          : lvl.isBreak
                          ? "bg-blue-950/40 border-blue-500 text-blue-400"
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 group-hover:border-zinc-600"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-4.5 h-4.5 stroke-[3.5]" />
                      ) : lvl.isBreak ? (
                        <Coffee className="w-4 h-4" />
                      ) : (
                        <span className="text-[15px] font-black font-mono">{lvl.level}</span>
                      )}
                    </div>

                    {/* Details/Labels below the circle */}
                    <div className="text-center mt-2.5">
                      <p
                        className={`text-[12.5px] font-black font-mono tracking-tight leading-none ${
                          isActive
                            ? "text-amber-500 font-extrabold"
                            : isCompleted
                            ? "text-emerald-400"
                            : "text-zinc-400"
                        }`}
                      >
                        {lvl.isBreak ? "BREAK" : `${lvl.smallBlind}/${lvl.bigBlind}`}
                      </p>
                      <p
                        className={`text-[11.25px] font-medium tracking-wide mt-1.5 leading-none ${
                          isActive ? "text-amber-500/90 font-bold" : "text-zinc-500"
                        }`}
                      >
                        {lvl.isBreak ? "BREAK" : `${lvl.duration} min`}
                      </p>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>



      {/* BOTTOM PRIZE PAYOUT SCROLLER */}
      <div className="bg-zinc-900/40 rounded-2xl p-5 pt-3 pb-4 shadow-lg mt-2 relative overflow-hidden flex flex-col md:flex-row md:items-center gap-4" id="payout-timeline-container">
        
        {/* Title area: aligned inline with the carousel, with dynamic places paid subtitle underneath */}
        <div className="flex items-start gap-4 shrink-0 select-none pb-1 md:pb-0 border-b border-zinc-850/40 md:border-b-0">
          <span className="text-xl mt-0.5">🏆</span>
          <div className="flex flex-col">
            <p className="text-base font-bold uppercase tracking-wider text-zinc-400 whitespace-nowrap">
              PRIZE PAYOUTS {payoutPageCount > 1 && `(${payoutRangeStart}-${payoutRangeEnd} / ${payouts.length})`}
            </p>
            <p className="text-sm font-black text-amber-500 tracking-widest uppercase mt-1">
              {payouts.length} PLAYERS WILL BE PAID
            </p>
          </div>
        </div>

        {/* Full-width Payout carousel - no scrollbar, auto-rotates every 20s */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div 
            key={payoutOffset}
            className={`flex items-center gap-4 pb-1.5 pt-1 animate-fade-in ${
              visiblePayouts.length < PAYOUTS_PER_PAGE ? "justify-center w-full" : "justify-start"
            }`}
          >
            {visiblePayouts.map((pay) => {
              const rankLabel = getRankLabel(pay.rank);
              const rankColor = pay.rank === 1 ? "text-yellow-500 font-black" : pay.rank === 2 ? "text-zinc-300 font-black" : pay.rank === 3 ? "text-amber-600 font-black" : "text-zinc-400 font-bold";

              return (
                <div 
                  key={pay.rank} 
                  className="bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-2 text-center hover:border-zinc-700 transition shrink-0 min-w-[128px] h-[72px] flex flex-col justify-center animate-fade-in"
                >
                  <p className={`text-sm tracking-wider font-bold ${rankColor}`}>{rankLabel}</p>
                  <p className="text-lg font-black font-mono text-zinc-100 mt-1">${pay.amount.toLocaleString()}</p>
                  <p className="text-xs text-zinc-500 font-mono mt-1">({pay.percentage}%)</p>
                </div>
              );
            })}
            {payouts.length === 0 && (
              <div className="w-full text-center py-4 text-zinc-500 uppercase text-sm font-bold">No payouts seeded</div>
            )}
          </div>
        </div>

        {/* Logo: right side, vertically aligned with prize payout row */}
        <div className="flex items-center justify-end shrink-0 self-end md:self-center pr-1 md:pr-2 mt-[15px]" id="footer-logo-block">
          <img 
            src="/logo.png?v=1.0.7" 
            alt="Club Poker Logo" 
            className="h-24 sm:h-28 md:h-32 lg:h-36 w-auto max-w-[200px] sm:max-w-[240px] md:max-w-[280px] object-contain bg-transparent border-0 drop-shadow-[0_4px_16px_rgba(255,255,255,0.08)]"
            referrerPolicy="no-referrer"
          />
        </div>

      </div>

      </>
      )}

      {/* Payout Modal / Popover */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition"
              aria-label="Close reset confirmation"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-red-500">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-black uppercase tracking-wider text-zinc-100">
                Reset Tournament?
              </h3>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed font-medium">
              This will permanently reset all tournament data to defaults, including players, tables, blinds, payouts, and timer progress. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase rounded-xl tracking-wider transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  resetDatabase();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase rounded-xl tracking-wider transition"
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showPayoutModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 max-w-xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h3 className="text-lg font-black uppercase text-zinc-100 tracking-wider flex items-center gap-2">
                <span>🏆</span> FULL PAYOUT STRUCTURE
              </h3>
              <button 
                onClick={() => setShowPayoutModal(false)}
                className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-zinc-400 hover:text-zinc-100 uppercase transition"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <div className="grid grid-cols-3 text-xs font-bold text-zinc-400 uppercase tracking-widest py-1 px-4 border-b border-zinc-900">
                <span>RANK</span>
                <span className="text-center">PERCENTAGE</span>
                <span className="text-right">PAYOUT AMOUNT</span>
              </div>
              
              {payouts.map((pay) => {
                const ranks = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"];
                const rankLabel = ranks[pay.rank - 1] || `${pay.rank}TH`;
                const isHighlight = pay.rank <= 3;
                
                return (
                  <div 
                    key={pay.rank} 
                    className={`grid grid-cols-3 text-sm py-2.5 px-4 rounded-xl border border-transparent transition ${
                      isHighlight ? "bg-zinc-950/40 border-zinc-900/50" : "hover:bg-zinc-950/20"
                    }`}
                  >
                    <span className={`font-black ${pay.rank === 1 ? "text-yellow-500" : pay.rank === 2 ? "text-zinc-300" : pay.rank === 3 ? "text-amber-600" : "text-zinc-400"}`}>
                      {rankLabel}
                    </span>
                    <span className="text-center font-mono text-zinc-400">{pay.percentage}%</span>
                    <span className="text-right font-mono font-black text-zinc-100">${pay.amount.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
