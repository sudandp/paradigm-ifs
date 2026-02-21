import React, { useEffect, useRef } from 'react';

const DeviceVerificationAnimation: React.FC = () => {
    const ignitionRef = useRef<HTMLAudioElement | null>(null);
    const rumbleRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // High-quality scifi ignition/power-up sound
        const ignition = new Audio('https://assets.mixkit.co/active_storage/sfx/2556/2556-preview.mp3');
        ignition.volume = 0.4;
        ignitionRef.current = ignition;

        // Deep cinematic engine rumble loop
        const rumble = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
        rumble.loop = true;
        rumble.volume = 0.15;
        rumbleRef.current = rumble;

        const playSounds = async () => {
            try {
                // Start ignition immediately
                await ignition.play();
                
                // Start rumble shortly after (simulating engine kicking in)
                setTimeout(async () => {
                    try {
                        await rumble.play();
                        // Subtle fade-in effect for rumble
                        let vol = 0;
                        const fadeInterval = setInterval(() => {
                            vol += 0.01;
                            rumble.volume = vol;
                            if (vol >= 0.15) clearInterval(fadeInterval);
                        }, 100);
                    } catch (err) {
                        console.log('Rumble playback blocked');
                    }
                }, 800);
            } catch (err) {
                console.log('Audio playback blocked - User interaction may be required');
            }
        };
        
        playSounds();

        return () => {
            ignition.pause();
            rumble.pause();
            ignition.src = '';
            rumble.src = '';
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[9999] overflow-hidden bg-gradient-to-br from-[#0a0b1e] via-[#050505] to-[#0a0b1e] flex items-center justify-center font-['Inter',_sans-serif]">
            {/* Diagonal Motion Streaks */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="streaks streaks-fast"></div>
                <div className="streaks streaks-medium"></div>
                <div className="streaks streaks-slow"></div>
            </div>

            <style>{`
                .streaks {
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: transparent;
                }
                .streaks-fast {
                    box-shadow: ${generateStreaks(100, '#8ab4f8')};
                    animation: moveDiagonal 1s linear infinite;
                }
                .streaks-medium {
                    box-shadow: ${generateStreaks(50, '#3f83f8')};
                    animation: moveDiagonal 3s linear infinite;
                    opacity: 0.6;
                }
                .streaks-slow {
                    box-shadow: ${generateStreaks(30, '#1e3a8a')};
                    animation: moveDiagonal 6s linear infinite;
                    opacity: 0.4;
                }

                @keyframes moveDiagonal {
                    from { transform: translate(-10%, -10%); }
                    to { transform: translate(10%, 10%); }
                }

                .rocket-container {
                    position: relative;
                    transform: rotate(45deg);
                    animation: jitter 0.1s linear infinite;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 200px;
                    height: 250px;
                    background-color: transparent !important;
                }

                @keyframes jitter {
                    0% { transform: rotate(45deg) translate(0, 0); }
                    25% { transform: rotate(45.5deg) translate(1.5px, -1.5px); }
                    50% { transform: rotate(43.5deg) translate(-1.5px, 1.5px); }
                    75% { transform: rotate(45.8deg) translate(1px, 1px); }
                    100% { transform: rotate(45deg) translate(0, 0); }
                }

                .flame {
                    transform-origin: top center;
                    filter: blur(1.5px);
                }
                
                .flame-outer {
                    animation: flicker 0.12s ease-in-out infinite alternate;
                }
                .flame-inner {
                    animation: flicker 0.08s ease-in-out infinite alternate-reverse;
                }
                .flame-core {
                    opacity: 0.9;
                }

                @keyframes flicker {
                    0% { transform: scaleY(1); opacity: 0.7; }
                    100% { transform: scaleY(1.5); opacity: 1; }
                }

                .rocket-body {
                    filter: drop-shadow(0 0 20px rgba(63, 131, 248, 0.6));
                }
            `}</style>

            <div className="text-center z-10">
                <div className="rocket-wrapper mb-8 relative flex justify-center items-center h-64">
                    <div className="rocket-container">
                        {/* Sleek Rocket SVG with integrated Flame */}
                        <svg width="180" height="240" viewBox="0 0 40 80" fill="none" className="rocket-body overflow-visible">
                            <defs>
                                <linearGradient id="rocketGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#94a3b8" />
                                    <stop offset="50%" stopColor="#f8fafc" />
                                    <stop offset="100%" stopColor="#94a3b8" />
                                </linearGradient>
                                <linearGradient id="flameOuterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#ef4444" />
                                    <stop offset="60%" stopColor="#f97316" />
                                    <stop offset="100%" stopColor="transparent" />
                                </linearGradient>
                                <linearGradient id="flameInnerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#fbbf24" />
                                    <stop offset="100%" stopColor="transparent" />
                                </linearGradient>
                            </defs>

                            {/* Flame (behind the rocket) */}
                            <g className="flame">
                                <path d="M11 52C11 52 13 78 20 85C27 78 29 52 29 52H11Z" fill="url(#flameOuterGrad)" className="flame-outer" />
                                <path d="M14 52C14 52 16 68 20 75C24 68 26 52 26 52H14Z" fill="url(#flameInnerGrad)" className="flame-inner" />
                                <path d="M18 52L20 62L22 52H18Z" fill="white" className="flame-core" />
                            </g>

                            {/* Rocket Body */}
                            <path d="M20 2C20 2 32 15 32 30C32 45 28 50 28 52H12C12 50 8 45 8 30C8 15 20 2 20 2Z" fill="url(#rocketGrad)"/>
                            
                            {/* Nose */}
                            <path d="M20 2C20 2 26 10 26 15H14C14 10 20 2 20 2Z" fill="#3f83f8"/>
                            
                            {/* Window */}
                            <circle cx="20" cy="25" r="4" fill="#0f172a" stroke="#3f83f8" strokeWidth="1.5"/>
                            <circle cx="18.5" cy="23.5" r="1" fill="white" opacity="0.4"/>
                            
                            {/* Pro Fins */}
                            <path d="M12 52H7C7 52 3 52 3 43L7 32V52Z" fill="#1e293b"/>
                            <path d="M28 52H33C33 52 37 52 37 43L33 32V52Z" fill="#1e293b"/>
                        </svg>
                    </div>
                </div>

                <div className="mt-4 px-6 relative z-30">
                    <h1 className="text-4xl font-black text-white mb-2 tracking-[0.2em] italic uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                        Ignition
                    </h1>
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-blue-400 text-sm font-mono tracking-widest animate-pulse">
                            &gt; Establishing secure uplink...
                        </p>
                        <div className="w-72 h-1 bg-gray-900/50 backdrop-blur-sm rounded-full overflow-hidden border border-blue-900/30">
                            <div className="h-full bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600 rounded-full animate-[progress_10s_ease-in-out_infinite] bg-[length:200%_100%]"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Subtle nebula glows */}
            <div className="absolute top-1/4 left-1/4 w-[40rem] h-[40rem] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>
    );
};

// Helper to generate high-speed motion streaks
function generateStreaks(n: number, color: string) {
    let value = '';
    for (let i = 0; i < n; i++) {
        const x = Math.floor(Math.random() * 2000);
        const y = Math.floor(Math.random() * 2000);
        if (i > 0) value += ', ';
        value += `${x}px ${y}px 0 0 ${color}`;
        for(let j=1; j<8; j++) {
            value += `, ${x - j*3}px ${y - j*3}px 0 0 ${color}${Math.floor(255 * (1 - j/8)).toString(16).padStart(2, '0')}`;
        }
    }
    return value;
}

export default DeviceVerificationAnimation;
