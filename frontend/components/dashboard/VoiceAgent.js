"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function VoiceAgent() {
    const [isListening, setIsListening] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState("Click to activate Voice AI");
    const [textInput, setTextInput] = useState("");
    const [showInput, setShowInput] = useState(false);

    const recognitionRef = useRef(null);
    const isActiveRef = useRef(false);
    const router = useRouter();

    const speakText = (text) => {
        if (typeof window === "undefined" || !window.speechSynthesis) return;
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
                        }, 800);
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
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onstart = () => {
                setIsListening(true);
                setTranscript("Listening... Say a question or command.");
            };

            recognitionRef.current.onresult = async (event) => {
                const current = event.resultIndex;
                let commandText = event.results[current][0].transcript.trim();
                let lowerCmd = commandText.toLowerCase();

                // Strip wake words if present
                if (lowerCmd.startsWith("neuro") || lowerCmd.startsWith("nero") || lowerCmd.startsWith("hey neuro")) {
                    commandText = commandText.replace(/^(hey\s+)?(neuro|nero)[,\s]*/i, "");
                }

                if (commandText.trim()) {
                    await processCommand(commandText.trim());
                }
            };

            recognitionRef.current.onerror = (event) => {
                if (event.error === 'no-speech' || event.error === 'network' || event.error === 'aborted') return;
                console.warn("Speech Recognition Error:", event.error);
                setIsListening(false);
                if (event.error === 'not-allowed') {
                    setTranscript("Mic permission required.");
                    isActiveRef.current = false;
                    setIsActive(false);
                }
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
                if (isActiveRef.current) {
                    try { recognitionRef.current?.start(); } catch (e) {}
                }
            };
        }
    }, [router]);

    const toggleListening = () => {
        if (isActiveRef.current) {
            isActiveRef.current = false;
            setIsActive(false);
            try { recognitionRef.current?.stop(); } catch (e) {}
            if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setIsSpeaking(false);
            setTranscript("Microphone muted. Click orb to speak.");
        } else {
            if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setIsSpeaking(false);
            isActiveRef.current = true;
            setIsActive(true);
            try {
                recognitionRef.current?.start();
                setTranscript("Listening... (e.g. 'go to dashboard', 'what is zero trust?')");
            } catch (e) {
                setTranscript("Voice active. Say your command.");
            }
        }
    };

    const handleTextSubmit = (e) => {
        e.preventDefault();
        if (textInput.trim()) {
            processCommand(textInput);
            setTextInput("");
            setShowInput(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-6 right-6 z-[99]"
        >
            <div className="relative flex items-center justify-end">
                {/* Transcript / Text Input Box */}
                <motion.div
                    initial={{ opacity: 0, width: 0, scale: 0.9 }}
                    animate={{
                        opacity: isActive || showInput || isSpeaking || isThinking ? 1 : 0,
                        width: isActive || showInput || isSpeaking || isThinking ? 'auto' : 0,
                        scale: isActive || showInput || isSpeaking || isThinking ? 1 : 0.9,
                        x: isActive || showInput || isSpeaking || isThinking ? -16 : 0
                    }}
                    transition={{ type: "spring", stiffness: 220, damping: 22 }}
                    className="absolute right-[80px] origin-right mr-4 overflow-hidden pointer-events-auto"
                >
                    <div className="bg-black/75 backdrop-blur-2xl border border-white/15 px-5 py-3 rounded-2xl shadow-2xl flex flex-col items-end min-w-[240px] max-w-[360px]">
                        <div className="flex items-center justify-between w-full mb-1.5">
                            <button
                                onClick={() => setShowInput(!showInput)}
                                className="text-[10px] text-cyan-400/80 hover:text-cyan-300 transition-colors uppercase font-mono tracking-wider flex items-center gap-1"
                            >
                                ⌨️ {showInput ? "Voice Mode" : "Type Query"}
                            </button>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold tracking-widest uppercase text-white/50">Neuro AI</span>
                                <span className={`w-2 h-2 rounded-full ${isThinking ? 'bg-purple-400 animate-pulse' : isSpeaking ? 'bg-emerald-400 animate-pulse' : isActive ? 'bg-cyan-400 animate-pulse' : 'bg-gray-500'}`} />
                            </div>
                        </div>

                        {showInput ? (
                            <form onSubmit={handleTextSubmit} className="w-full flex gap-1.5 mt-1">
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder="e.g. go to devices, what is zero trust?"
                                    className="w-full bg-white/10 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    className="bg-cyan-500 hover:bg-cyan-400 text-black px-2.5 py-1 rounded-lg text-xs font-bold transition-colors"
                                >
                                    Ask
                                </button>
                            </form>
                        ) : (
                            <p className="text-xs font-medium text-white/90 text-right leading-relaxed" title={transcript}>
                                {transcript}
                            </p>
                        )}
                    </div>
                </motion.div>

                {/* The Floating Glowing Orb Component */}
                <button
                    onClick={toggleListening}
                    className="relative group outline-none cursor-pointer"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                    title={isActive ? "Click to Mute Neuro Voice Assistant" : "Click to Speak with Neuro Voice Assistant"}
                >
                    <motion.div
                        className="w-[80px] h-[80px] flex items-center justify-center relative transition-all duration-300"
                        whileHover={{ scale: 1.06 }}
                        whileTap={{ scale: 0.94 }}
                        animate={{
                            filter: isActive ? (isSpeaking ? "drop-shadow(0 0 25px rgba(52, 211, 153, 0.9))" : isThinking ? "drop-shadow(0 0 25px rgba(192, 132, 252, 0.9))" : "drop-shadow(0 0 25px rgba(167, 139, 250, 0.7))") : "drop-shadow(0 0 10px rgba(0,0,0,0.5))"
                        }}
                    >
                        {/* Wavy rotating ring 1 (Purple / Blue) */}
                        <motion.div
                            className={`absolute inset-0 rounded-[40%_60%_70%_30%] border-[3px] border-[#7c3aed]/80 blur-[2px] transition-opacity duration-1000 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                        />
                        {/* Wavy rotating ring 2 (Pink) */}
                        <motion.div
                            className={`absolute inset-[-3px] rounded-[60%_40%_30%_70%] border-[3px] border-[#f472b6]/70 blur-[3px] transition-opacity duration-1000 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                            animate={{ rotate: -360 }}
                            transition={{ repeat: Infinity, duration: 12, ease: "linear" }}
                        />
                        {/* Wavy rotating ring 3 (Light Blue) */}
                        <motion.div
                            className={`absolute inset-[2px] rounded-[50%_50%_40%_60%] border-[3px] border-[#7dd3fc]/80 blur-[1px] transition-opacity duration-1000 ${isActive ? 'opacity-100' : 'opacity-0'}`}
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                        />

                        {/* Core Glass Sphere */}
                        <div
                            className={`absolute inset-2 rounded-full border transition-all duration-1000 overflow-hidden ${isActive ? 'border-white/40 opacity-100' : 'border-white/10 opacity-70 grayscale'}`}
                            style={{
                                background: "radial-gradient(circle at 35% 35%, #e0f2fe 0%, #a5b4fc 40%, #818cf8 80%, #4f46e5 100%)",
                                boxShadow: "inset -8px -8px 16px rgba(0,0,0,0.1), inset 8px 8px 16px rgba(255,255,255,0.9)"
                            }}>
                            {/* Glossy reflection highlight */}
                            <div className="absolute top-[8%] left-[15%] w-[45%] h-[35%] bg-white/70 rounded-full blur-[2px] rotate-[-40deg]" style={{ boxShadow: "0 0 10px white" }} />
                        </div>

                        {/* Overlaid Interaction Glow */}
                        <motion.div
                            className="absolute inset-2 rounded-full mix-blend-overlay"
                            animate={{
                                backgroundColor: isListening && !isThinking ? 'rgba(45, 212, 191, 0.5)' :
                                    isThinking ? 'rgba(192, 132, 252, 0.7)' :
                                        isSpeaking ? 'rgba(52, 211, 153, 0.7)' : 'rgba(255, 255, 255, 0)',
                            }}
                            transition={isActive ? { repeat: Infinity, duration: 1.2, repeatType: "reverse" } : {}}
                        />

                        {/* Microphone Icon */}
                        <div className={`absolute inset-2 z-10 transition-opacity duration-500 rounded-full flex items-center justify-center overflow-hidden ${isActive ? 'opacity-0 group-hover:opacity-100 hover:bg-black/20' : 'opacity-100 bg-black/40'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white drop-shadow-lg">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                        </div>
                    </motion.div>
                </button>
            </div>
        </motion.div>
    );
}
