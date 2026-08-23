"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function VoiceAgent() {
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState("Tap orb to speak");
    const [spokenResponse, setSpokenResponse] = useState("");

    const recognitionRef = useRef(null);
    const isListeningRef = useRef(false);
    const router = useRouter();

    const speakText = (text) => {
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        try {
            window.speechSynthesis.cancel();
            setIsSpeaking(true);
            const speech = new SpeechSynthesisUtterance(text);

            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v =>
                v.name.includes("Google UK English Female") ||
                v.name.includes("Google US English") ||
                v.lang === 'en-IN' ||
                v.lang === 'en-US' ||
                v.lang === 'en-GB'
            );
            if (preferredVoice) speech.voice = preferredVoice;

            speech.rate = 1.02;
            speech.pitch = 1.0;

            speech.onend = () => setIsSpeaking(false);
            speech.onerror = () => setIsSpeaking(false);
            window.speechSynthesis.speak(speech);
        } catch (e) {
            setIsSpeaking(false);
        }
    };

    const processCommand = async (commandText) => {
        const cleanCommand = commandText.trim();
        if (!cleanCommand) return;

        setTranscript(`"${cleanCommand}"`);
        setIsThinking(true);

        try {
            const res = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ command: cleanCommand })
            });

            const data = await res.json();
            setIsThinking(false);

            const replyMessage = data.message || "Command executed.";
            setSpokenResponse(replyMessage);
            setTranscript(replyMessage);
            speakText(replyMessage);

            // Execute voice navigation actions
            if (data.actions && Array.isArray(data.actions)) {
                for (const action of data.actions) {
                    if (action.type === "navigate" && action.page) {
                        setTimeout(() => {
                            router.push(action.page);
                        }, 750);
                    }
                }
            }
        } catch (err) {
            console.error("AI Voice Assistant Error:", err);
            setIsThinking(false);
            const errMsg = "Connection to AI core failed.";
            setTranscript(errMsg);
            speakText(errMsg);
        }
    };

    useEffect(() => {
        if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                isListeningRef.current = true;
                setTranscript("Listening... Speak your command now.");
            };

            recognitionRef.current.onresult = async (event) => {
                const current = event.resultIndex;
                let commandText = event.results[current][0].transcript.trim();
                let lowerCmd = commandText.toLowerCase();

                if (lowerCmd.startsWith("neuro") || lowerCmd.startsWith("nero") || lowerCmd.startsWith("hey neuro")) {
                    commandText = commandText.replace(/^(hey\s+)?(neuro|nero)[,\s]*/i, "");
                }

                if (commandText.trim()) {
                    await processCommand(commandText.trim());
                }
            };

            recognitionRef.current.onerror = (event) => {
                console.warn("Speech Recognition Error:", event.error);
                setIsListening(false);
                isListeningRef.current = false;
                if (event.error === 'not-allowed') {
                    setTranscript("Mic access blocked. Enable permissions.");
                }
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
                isListeningRef.current = false;
            };
        }
    }, [router]);

    const toggleVoice = () => {
        if (isListening) {
            // Stop listening
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) {}
            }
            if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setIsListening(false);
            isListeningRef.current = false;
            setIsSpeaking(false);
            setTranscript("Tap orb to speak");
        } else {
            // Start listening
            if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setIsSpeaking(false);
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.start();
                } catch (e) {
                    try {
                        recognitionRef.current.stop();
                        setTimeout(() => recognitionRef.current.start(), 100);
                    } catch (err) {}
                }
            } else {
                setTranscript("Voice recognition not supported in this browser.");
            }
        }
    };

    const isVisible = isListening || isThinking || isSpeaking;

    return (
        <div className="fixed bottom-6 right-6 z-[999] pointer-events-auto select-none">
            <div className="relative flex items-center justify-end">
                {/* Floating Holographic Voice HUD Tooltip (Pure Voice Feedback) */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.85, x: 20 }}
                    animate={{
                        opacity: isVisible ? 1 : 0,
                        scale: isVisible ? 1 : 0.85,
                        x: isVisible ? -16 : 20,
                        pointerEvents: isVisible ? "auto" : "none"
                    }}
                    transition={{ type: "spring", stiffness: 260, damping: 22 }}
                    className="absolute right-[85px] origin-right overflow-hidden shadow-2xl rounded-2xl bg-black/80 backdrop-blur-2xl border border-cyan-500/30 px-4 py-3 min-w-[220px] max-w-[320px]"
                    style={{
                        boxShadow: "0 15px 40px rgba(0,0,0,0.8), 0 0 20px rgba(6,182,212,0.2)"
                    }}
                >
                    <div className="flex items-center justify-between gap-2 mb-1.5 border-b border-white/10 pb-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 font-mono">
                            Neuro AI Voice
                        </span>
                        {/* Dynamic Soundwave Equalizer */}
                        <div className="flex items-center gap-0.5 h-3">
                            <span className={`w-0.5 bg-cyan-400 rounded-full transition-all ${isSpeaking ? "h-3 animate-bounce" : isListening ? "h-2 animate-pulse" : "h-1"}`} />
                            <span className={`w-0.5 bg-cyan-300 rounded-full transition-all ${isSpeaking ? "h-4 animate-bounce delay-75" : isListening ? "h-3 animate-pulse" : "h-1"}`} />
                            <span className={`w-0.5 bg-purple-400 rounded-full transition-all ${isSpeaking ? "h-2.5 animate-bounce delay-150" : isListening ? "h-2 animate-pulse" : "h-1"}`} />
                            <span className={`w-0.5 bg-cyan-400 rounded-full transition-all ${isSpeaking ? "h-3.5 animate-bounce delay-100" : isListening ? "h-1.5 animate-pulse" : "h-1"}`} />
                        </div>
                    </div>

                    <p className="text-xs text-white/90 font-medium leading-snug">
                        {isThinking ? (
                            <span className="text-purple-300 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                                Processing command...
                            </span>
                        ) : isListening ? (
                            <span className="text-cyan-300 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                                Listening... Speak now
                            </span>
                        ) : (
                            transcript
                        )}
                    </p>
                </motion.div>

                {/* Pure Floating Glowing 3D AI Voice Orb */}
                <button
                    onClick={toggleVoice}
                    className="relative group outline-none cursor-pointer"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    title={isListening ? "Listening... Click to stop" : "Click to speak with Neuro AI Assistant"}
                >
                    <motion.div
                        className="w-[78px] h-[78px] flex items-center justify-center relative transition-all duration-300"
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        animate={{
                            filter: isSpeaking
                                ? "drop-shadow(0 0 35px rgba(52, 211, 153, 0.95))"
                                : isListening
                                    ? "drop-shadow(0 0 35px rgba(6, 182, 212, 0.95))"
                                    : isThinking
                                        ? "drop-shadow(0 0 35px rgba(192, 132, 252, 0.95))"
                                        : "drop-shadow(0 0 20px rgba(124, 58, 237, 0.75))"
                        }}
                    >
                        {/* Wavy acoustic aura ring 1 */}
                        <motion.div
                            className={`absolute inset-0 rounded-[40%_60%_70%_30%] border-[3px] blur-[2px] transition-colors duration-500 ${isListening ? "border-cyan-400" : isSpeaking ? "border-emerald-400" : "border-[#7c3aed]/80"}`}
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: isListening ? 4 : 8, ease: "linear" }}
                        />
                        {/* Wavy acoustic aura ring 2 */}
                        <motion.div
                            className={`absolute inset-[-3px] rounded-[60%_40%_30%_70%] border-[3px] blur-[2px] transition-colors duration-500 ${isListening ? "border-blue-400" : isSpeaking ? "border-teal-300" : "border-[#06b6d4]/70"}`}
                            animate={{ rotate: -360 }}
                            transition={{ repeat: Infinity, duration: isListening ? 5 : 10, ease: "linear" }}
                        />

                        {/* Core Glass Sphere with 3D Depth */}
                        <div
                            className="absolute inset-2 rounded-full border border-white/40 overflow-hidden"
                            style={{
                                background: isListening
                                    ? "radial-gradient(circle at 35% 35%, #cffafe 0%, #38bdf8 40%, #0284c7 80%, #0369a1 100%)"
                                    : isSpeaking
                                        ? "radial-gradient(circle at 35% 35%, #d1fae5 0%, #34d399 40%, #059669 80%, #047857 100%)"
                                        : "radial-gradient(circle at 35% 35%, #e0f2fe 0%, #a5b4fc 40%, #818cf8 80%, #4f46e5 100%)",
                                boxShadow: "inset -8px -8px 16px rgba(0,0,0,0.2), inset 8px 8px 16px rgba(255,255,255,0.9)"
                            }}
                        >
                            <div className="absolute top-[8%] left-[15%] w-[45%] h-[35%] bg-white/70 rounded-full blur-[2px] rotate-[-40deg]" />
                        </div>

                        {/* Centered Voice Microphone Icon */}
                        <div className="absolute inset-2 z-10 flex items-center justify-center">
                            {isListening ? (
                                <span className="w-4 h-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,1)] animate-ping" />
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white drop-shadow-md">
                                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                </svg>
                            )}
                        </div>
                    </motion.div>
                </button>
            </div>
        </div>
    );
}
