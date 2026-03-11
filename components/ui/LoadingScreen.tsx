import React, { useEffect, useRef } from 'react';

interface LoadingScreenProps {
    message?: string;
    fullScreen?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...', fullScreen = true }) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        // Professional motion/whoosh sound for rotation
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'); // Using the rumble sound as a base for premium feel, or could use a whoosh
        audio.loop = true;
        audio.volume = 0.1;
        audioRef.current = audio;

        const playSound = async () => {
            try {
                await audio.play();
                // Subtly increase volume
                let vol = 0;
                const fadeInterval = setInterval(() => {
                    vol += 0.01;
                    if (audio) audio.volume = vol;
                    if (vol >= 0.15) clearInterval(fadeInterval);
                }, 100);
            } catch (err) {
                console.log('Audio playback blocked - User interaction may be required');
            }
        };
        
        playSound();

        return () => {
            audio.pause();
            audio.src = '';
        };
    }, []);

    const containerStyle = fullScreen 
        ? "fixed inset-0 z-[9999] overflow-hidden bg-white flex items-center justify-center font-['Inter',_sans-serif]"
        : "relative overflow-hidden bg-white flex flex-col items-center justify-center min-h-[400px] w-full font-['Inter',_sans-serif] rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.05)] transition-all duration-300";

    return (
        <div className={containerStyle}>
            <style>{`
                @keyframes slowRotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .logo-container {
                    background: transparent;
                    border-radius: 9999px;
                    padding: 2rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    overflow: hidden;
                }

                .rotate-wrapper {
                    animation: slowRotate 10s linear infinite;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                @keyframes progress {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>

            <div className="text-center z-10 flex flex-col items-center">
                <div className={`${fullScreen ? 'mb-12' : 'mb-8'} relative flex flex-col justify-center items-center`}>
                    <div className="relative mb-8">
                        <div className={`logo-container ${fullScreen ? 'w-64 h-64' : 'w-48 h-48'}`}>
                            <div className="rotate-wrapper">
                                <img 
                                    src="/logo-simple.png" 
                                    alt="Paradigm Logo" 
                                    className="w-full h-full object-contain p-2"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="company-text flex flex-col items-center">
                        <h2 className={`${fullScreen ? 'text-5xl' : 'text-3xl'} font-black text-[#1A4331] tracking-[0.2em] uppercase mb-1`}>
                            PARADIGM
                        </h2>
                        <h3 className={`${fullScreen ? 'text-2xl' : 'text-xl'} font-bold text-[#2f6a42] tracking-[0.4em] uppercase opacity-90`}>
                            SERVICES
                        </h3>
                    </div>
                </div>

                <div className={`${fullScreen ? 'px-6' : 'px-4'} relative z-30`}>
                    <p className="text-[#1A4331] text-xs font-mono tracking-widest animate-pulse mb-4 font-semibold">
                        {message === 'Loading...' ? '> Initializing System...' : `> ${message}`}
                    </p>
                    <div className={`${fullScreen ? 'w-72' : 'w-48'} h-1 bg-gray-200 rounded-full overflow-hidden border border-gray-300`}>
                        <div className="h-full bg-gradient-to-r from-[#1A4331] via-[#2f6a42] to-[#1A4331] rounded-full animate-[progress_3s_linear_infinite] bg-[length:200%_100%]"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;
