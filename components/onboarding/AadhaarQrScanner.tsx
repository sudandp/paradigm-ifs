import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, Camera, AlertCircle, X, FileText, SwitchCamera } from 'lucide-react';
import Button from '../ui/Button';

interface AadhaarData {
    name: string;
    dob: string;
    gender: string;
    address: {
        line1: string;
        city: string;
        state: string;
        pincode: string;
    };
    aadhaarNumber: string;
    photo?: string;
}

interface AadhaarQrScannerProps {
    onScanSuccess: (data: AadhaarData) => void;
    onClose: () => void;
    isFullScreenPage?: boolean;
}

const AadhaarQrScanner: React.FC<AadhaarQrScannerProps> = ({ onScanSuccess, onClose, isFullScreenPage = false }) => {
    const [scanState, setScanState] = useState<'idle' | 'reading' | 'success' | 'error'>('idle');
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const detectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const qrCodeRegionId = "qr-reader";
    const isMountedRef = useRef(true);
    const initializationLock = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        
        const initScanner = async () => {
            if (initializationLock.current) return;
            initializationLock.current = true;

            try {
                await new Promise(r => setTimeout(r, 100));
                if (!isMountedRef.current) return;
                
                if (scannerRef.current) {
                    try {
                        if (scannerRef.current.isScanning) await scannerRef.current.stop();
                        scannerRef.current.clear();
                    } catch (e) { /* ignore */ }
                }
                
                const region = document.getElementById(qrCodeRegionId);
                if (region) region.innerHTML = "";
                
                await startScanner();
                resetDetectionTimeout();
            } finally {
                // initializationLock.current = false;
            }
        };

        initScanner();

        return () => {
            isMountedRef.current = false;
            if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
            stopScanner();
        };
    }, [facingMode]); // Re-init when camera switches

    const resetDetectionTimeout = () => {
        if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
        detectionTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current && scanState === 'idle') {
                setScanState('error');
                setError('QR not detected. Please try again.');
            }
        }, 5000);
    };

    const parseAadhaarQR = (qrText: string): AadhaarData | null => {
        try {
            if (qrText.includes('<?xml')) {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(qrText, 'text/xml');
                const uid = xmlDoc.querySelector('uid')?.textContent || '';
                const name = xmlDoc.querySelector('name')?.textContent || '';
                const dob = xmlDoc.querySelector('dob')?.textContent || '';
                const gender = xmlDoc.querySelector('gender')?.textContent || '';
                const co = xmlDoc.querySelector('co')?.textContent || '';
                const house = xmlDoc.querySelector('house')?.textContent || '';
                const street = xmlDoc.querySelector('street')?.textContent || '';
                const lm = xmlDoc.querySelector('lm')?.textContent || '';
                const loc = xmlDoc.querySelector('loc')?.textContent || '';
                const vtc = xmlDoc.querySelector('vtc')?.textContent || '';
                const po = xmlDoc.querySelector('po')?.textContent || '';
                const dist = xmlDoc.querySelector('dist')?.textContent || '';
                const subdist = xmlDoc.querySelector('subdist')?.textContent || '';
                const state = xmlDoc.querySelector('state')?.textContent || '';
                const pc = xmlDoc.querySelector('pc')?.textContent || '';

                const addressParts = [co, house, street, lm, loc, po, subdist].filter(Boolean);
                const line1 = addressParts.join(', ');

                return {
                    name, dob: formatDobToISO(dob), gender: formatGender(gender),
                    address: { line1, city: vtc || dist, state, pincode: pc },
                    aadhaarNumber: uid
                };
            } else {
                const parts = qrText.split('|');
                if (parts.length < 4) throw new Error('Invalid Aadhaar QR format');
                const [uid, name, dob, gender, ...addressParts] = parts;
                return {
                    name, dob: formatDobToISO(dob), gender: formatGender(gender),
                    address: {
                        line1: addressParts.slice(0, -3).join(', '),
                        city: addressParts[addressParts.length - 3] || '',
                        state: addressParts[addressParts.length - 2] || '',
                        pincode: addressParts[addressParts.length - 1] || ''
                    },
                    aadhaarNumber: uid
                };
            }
        } catch (err) {
            console.error('Error parsing Aadhaar QR:', err);
            return null;
        }
    };

    const formatDobToISO = (dob: string): string => {
        if (!dob) return '';
        const parts = dob.split(/[-/]/);
        if (parts.length === 3) {
            const [day, month, year] = parts;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return dob;
    };

    const formatGender = (gender: string): string => {
        const g = gender.toUpperCase();
        if (g === 'M' || g === 'MALE') return 'Male';
        if (g === 'F' || g === 'FEMALE') return 'Female';
        return 'Other';
    };

    const startScanner = async () => {
        try {
            setScanState('idle');
            setError(null);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: facingMode }, // Use state for camera switching
                {
                    fps: 15,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const edgeSize = Math.floor(minEdge * 0.7);
                        return { width: edgeSize, height: edgeSize };
                    }
                },
                (decodedText) => {
                    setScanState('reading');
                    const parsedData = parseAadhaarQR(decodedText);
                    if (parsedData) {
                        setScanState('success');
                        handleScanSuccess(parsedData);
                    } else {
                        setError('Invalid Aadhaar QR code. Please try again.');
                        setScanState('error');
                    }
                },
                (errorMessage) => { }
            );
        } catch (err: any) {
            console.error('Scanner error:', err);
            setError(`Camera access denied or unavailable: ${err.message}`);
            setScanState('error');
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) await scannerRef.current.stop();
                scannerRef.current.clear();
            } catch (err: any) {
                if (!err.message?.includes('not running')) console.error('Error stopping scanner:', err);
            }
        }
    };

    const handleScanSuccess = async (data: AadhaarData) => {
        await stopScanner();
        setTimeout(() => onScanSuccess(data), 500);
    };

    const handleClose = async () => {
        await stopScanner();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <div className="bg-black/90 backdrop-blur-md p-4 pt-12 flex items-center border-b border-white/10 shrink-0 z-20">
                <button onClick={handleClose} className="p-2 text-white hover:bg-white/10 rounded-full transition-colors mr-3">
                    <ArrowLeft className="h-7 w-7" />
                </button>
                <div>
                    <h3 className="text-xl font-black text-white tracking-tight uppercase">Scan Aadhaar QR</h3>
                    <p className="text-sm text-white/50 font-medium">Align the Aadhaar QR inside the box</p>
                </div>
                <div className="flex-1" />
                <button 
                    onClick={() => {
                        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
                        initializationLock.current = false; // Allow re-init
                    }}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all active:scale-90"
                    title="Switch Camera"
                >
                    <SwitchCamera className="h-6 w-6" />
                </button>
            </div>

            {/* Viewfinder Area */}
            <div className="flex-1 relative bg-black overflow-hidden flex flex-col items-center justify-center">
                <div id={qrCodeRegionId} className="absolute inset-0 w-full h-full">
                    <style>{`
                        #${qrCodeRegionId} { width: 100% !important; height: 100% !important; }
                        #${qrCodeRegionId} video { width: 100% !important; height: 100% !important; object-fit: cover !important; display: block !important; }
                        #${qrCodeRegionId} > div { display: none !important; }
                        #${qrCodeRegionId} > video { display: block !important; }
                    `}</style>
                </div>

                {/* Dark Mask for Focus */}
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                    <div className="absolute inset-0 bg-black/40" />
                    
                    {/* Viewfinder Box (Square 70% width) */}
                    <div className="w-72 h-72 relative bg-transparent rounded-2xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] animate-in zoom-in-95 duration-500">
                        {/* Corner markers style ┐ ┌ └ ┘ - Brighter and Thicker */}
                        <div className="absolute -top-1.5 -left-1.5 w-14 h-14 border-t-[6px] border-l-[6px] border-accent rounded-tl-2xl" />
                        <div className="absolute -top-1.5 -right-1.5 w-14 h-14 border-t-[6px] border-r-[6px] border-accent rounded-tr-2xl" />
                        <div className="absolute -bottom-1.5 -left-1.5 w-14 h-14 border-b-[6px] border-l-[6px] border-accent rounded-bl-2xl" />
                        <div className="absolute -bottom-1.5 -right-1.5 w-14 h-14 border-b-[6px] border-r-[6px] border-accent rounded-br-2xl" />
                        
                        {/* Intent Visual Overlay - Subtle Icon */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-10">
                             <FileText className="h-32 w-32 text-white" />
                        </div>

                        {/* Status Label - Simplified */}
                        <div className="absolute -bottom-20 left-0 right-0 text-center flex justify-center">
                            <span className={`text-sm font-bold px-6 py-2.5 rounded-full shadow-2xl transition-all duration-300 border
                                ${scanState === 'reading' ? 'bg-orange-500 border-orange-400 text-white animate-pulse' : 
                                  scanState === 'success' ? 'bg-green-500 border-green-400 text-white scale-110' : 
                                  'bg-black/40 backdrop-blur-md border-white/20 text-white'}`}>
                                {scanState === 'reading' ? 'Reading QR code...' : 'Align the Aadhaar QR inside the box'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Helper Text */}
                <div className="absolute bottom-24 left-0 right-0 text-center px-10 z-20">
                    <p className="text-white text-lg font-bold drop-shadow-2xl">
                        Point the camera at the printed Aadhaar QR code
                    </p>
                    <p className="text-white/50 text-xs mt-3 italic tracking-wide">
                        Ensure the card is flat and well-lit
                    </p>
                </div>
            </div>

            {error && scanState === 'error' && (
                <div className="absolute bottom-10 left-4 right-4 z-[110] animate-in slide-in-from-bottom-8 duration-300">
                    <div className="bg-red-600 text-white p-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-4 border border-white/20">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="h-6 w-6 shrink-0" />
                            <p className="font-bold text-base leading-tight">QR not detected. Please try again.</p>
                        </div>
                        <button 
                            onClick={async () => { 
                                setScanState('idle'); 
                                setError(null); 
                                await stopScanner();
                                await startScanner();
                                resetDetectionTimeout(); 
                            }} 
                            className="bg-white text-red-600 w-full py-3.5 rounded-xl text-sm font-black transition-transform active:scale-95 shadow-lg"
                        >
                            RETRY SCANNING
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AadhaarQrScanner;
