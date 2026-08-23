"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function VoiceAgent() {
    const [isListening, setIsListening] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState("Hello! I am NeuroGuard AI. Click to speak or type a command.");
    const [textInput, setTextInput] = useState("");
    const [showInput, setShowInput] = useState(false);
    const [hasSpeechSupport, setHasSpeechSupport] = useState(false);

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

            speech.rate = 1.0;
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

            const replyMessage = data.message || "Command processed.";
            setTranscript(replyMessage);
            speakText(replyMessage);

            // Execute actions (like navigation)
            if (data.actions && Array.isArray(data.actions)) {
                for (const action of data.actions) {
                    if (action.type === "navigate" && action.page) {
                        setTimeout(() => {
                            router.push(action.page);
                        }, 700);
                    }
                }
            }
        } catch (err) {
            console.error("AI Agent Error:", err);
            setIsThinking(false);
            setTranscript("Could not reach AI core.");
            speakText("Could not reach AI core. Please check network connection.");
        }
    };

    useEffect(() => {
        if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
            setHasSpeechSupport(true);
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
                    setTranscript("Microphone permission denied. Use text box below.");
                    setShowInput(true);
                }
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
                isListeningRef.current = false;
            };
        } else {
            setHasSpeechSupport(false);
        }
    }, [router]);

    const handleOrbClick = () => {
        setIsOpen(prev => !prev);
        if (!isOpen) {
            startListening();
        } else {
            stopListening();
        }
    };

    const startListening = () => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        if (recognitionRef.current) {
            try {
                recognitionRef.current.start();
            } catch (e) {
                // If already running or error, toggle input
                setShowInput(true);
            }
        } else {
            setShowInput(true);
            setTranscript("Voice input not supported in this browser. Type below:");
        }
    };

    const stopListening = () => {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) {}
        }
        if (typeof window !== "undefined" && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setIsListening(false);
        isListeningRef.current = false;
        setIsSpeaking(false);
    };

    const handleTextSubmit = (e) => {
        e.preventDefault();
        if (textInput.trim()) {
            processCommand(textInput);
            setTextInput("");
        }
    };

    const quickActions = [
        { label: "Dashboard", cmd: "go to dashboard" },
        { label: "Devices", cmd: "go to devices" },
        { label: "Network", cmd: "go to network" },
        { label: "Threats", cmd: "go to threats" },
        { label: "Investigations", cmd: "go to investigations" },
        { label: "Reports", cmd: "go to reports" },
    ];

    return (
        <div className="fixed bottom-6 right-6 z-[999] pointer-events-auto">
            <div className="relative flex items-center justify-end">
                {/* Assistant Chat / Voice Dialogue Box */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{
                        opacity: isOpen ? 1 : 0,
                        scale: isOpen ? 1 : 0.9,
                        y: isOpen ? 0 : 10,
                        pointerEvents: isOpen ? "auto" : "none"
                    }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    className="absolute bottom-[90px] right-0 overflow-hidden w-[320px] md:w-[380px] shadow-2xl rounded-3xl bg-[#0a0f1d]/95 backdrop-blur-2xl border border-cyan-500/30 p-5 flex flex-col gap-3"
                    style={{
                        boxShadow: "0 20px 50px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.2)"
                    }}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            </div>
                            <span className="text-xs font-bold tracking-wider text-white uppercase">NeuroGuard Voice AI</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowInput(!showInput)}
                                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-md transition-colors"
                            >
                                {showInput ? "🎙️ Voice Mode" : "⌨️ Text"}
                            </button>
                            <button
                                onClick={() => { setIsOpen(false); stopListening(); }}
                                className="text-white/40 hover:text-white text-xs px-1.5 py-0.5 rounded transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Speech / Transcript Area */}
                    <div className="bg-black/40 rounded-2xl p-3.5 border border-white/5 min-h-[60px] flex items-center justify-between">
                        <p className="text-xs text-white/90 leading-relaxed font-medium">
                            {isThinking ? (
                                <span className="text-purple-300 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                                    Analyzing network telemetry...
                                </span>
                            ) : isListening ? (
                                <span className="text-cyan-300 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                                    Listening to your voice... Speak now!
                                </span>
                            ) : (
                                transcript
                            )}
                        </p>
                    </div>

                    {/* Microphone Controls */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={isListening ? stopListening : startListening}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${isListening ? "bg-rose-500/30 text-rose-300 border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse" : "bg-gradient-to-r from-cyan-500 to-blue-600 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:brightness-110"}`}
                        >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                            {isListening ? "Stop Listening" : "Tap to Speak"}
                        </button>
                    </div>

                    {/* Text Input Option */}
                    {showInput && (
                        <form onSubmit={handleTextSubmit} className="flex gap-1.5 mt-0.5">
                            <input
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder="Type e.g. 'go to devices' or 'is network safe?'"
                                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400"
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="bg-cyan-500 hover:bg-cyan-400 text-black px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Send
                            </button>
                        </form>
                    )}

                    {/* Quick Voice Navigation Shortcuts */}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/10">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider w-full mb-0.5">Quick Voice Commands:</span>
                        {quickActions.map(act => (
                            <button
                                key={act.label}
                                onClick={() => processCommand(act.cmd)}
                                className="text-[10px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white px-2 py-1 rounded-lg border border-white/10 transition-colors cursor-pointer"
                            >
                                {act.label}
                            </button>
                        ))}
                    </div>
                </motion.div>

                {/* The Floating Glowing 3D AI Orb Button */}
                <button
                    onClick={handleOrbClick}
                    className="relative group outline-none cursor-pointer"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    title="Open Neuro Voice Assistant"
                >
                    <motion.div
                        className="w-[76px] h-[76px] flex items-center justify-center relative transition-all duration-300"
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        animate={{
                            filter: isSpeaking ? "drop-shadow(0 0 30px rgba(52, 211, 153, 0.9))" : isListening ? "drop-shadow(0 0 30px rgba(6, 182, 212, 0.9))" : isThinking ? "drop-shadow(0 0 30px rgba(192, 132, 252, 0.9))" : "drop-shadow(0 0 20px rgba(124, 58, 237, 0.7))"
                        }}
                    >
                        {/* Wavy rotating rings */}
                        <motion.div
                            className="absolute inset-0 rounded-[40%_60%_70%_30%] border-[3px] border-[#7c3aed]/80 blur-[2px]"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                        />
                        <motion.div
                            className="absolute inset-[-3px] rounded-[60%_40%_30%_70%] border-[3px] border-[#06b6d4]/70 blur-[2px]"
                            animate={{ rotate: -360 }}
                            transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                        />

                        {/* Core Glass Sphere */}
                        <div
                            className="absolute inset-2 rounded-full border border-white/40 overflow-hidden"
                            style={{
                                background: "radial-gradient(circle at 35% 35%, #e0f2fe 0%, #a5b4fc 40%, #818cf8 80%, #4f46e5 100%)",
                                boxShadow: "inset -8px -8px 16px rgba(0,0,0,0.15), inset 8px 8px 16px rgba(255,255,255,0.9)"
                            }}
                        >
                            <div className="absolute top-[8%] left-[15%] w-[45%] h-[35%] bg-white/70 rounded-full blur-[2px] rotate-[-40deg]" />
                        </div>

                        {/* Microphone / AI Icon */}
                        <div className="absolute inset-2 z-10 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white drop-shadow-md">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                        </div>
                    </motion.div>
                </button>
            </div>
        </div>
    );
}
