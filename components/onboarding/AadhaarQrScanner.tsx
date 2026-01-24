import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';
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
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const qrCodeRegionId = "qr-reader";

    const isMountedRef = useRef(true);
    const initializationLock = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        
        const initScanner = async () => {
            // Prevent double-execution in Strict Mode
            if (initializationLock.current) return;
            initializationLock.current = true;

            try {
                // Wait a brief moment to allow any previous cleanup to finish
                await new Promise(r => setTimeout(r, 100));
                
                if (!isMountedRef.current) return;
                
                // Safety: Stop existing
                if (scannerRef.current) {
                    try {
                        if (scannerRef.current.isScanning) {
                            await scannerRef.current.stop();
                        }
                        scannerRef.current.clear();
                    } catch (e) { /* ignore */ }
                }
                
                // Hard cleanup of DOM
                const region = document.getElementById(qrCodeRegionId);
                if (region) region.innerHTML = "";
                
                await startScanner();
            } finally {
                // initializationLock.current = false; // Keep locked to prevent re-runs
            }
        };

        initScanner();

        return () => {
            isMountedRef.current = false;
            stopScanner();
        };
    }, []);

    const parseAadhaarQR = (qrText: string): AadhaarData | null => {
        try {
            // Aadhaar QR format: It's either XML or a pipe-separated format
            // New format (Secure QR): Contains signed XML data
            // Old format: Pipe-separated values
            
            if (qrText.includes('<?xml')) {
                // XML format - parse the PrintLetterBarcodeData
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

                // Build address line
                const addressParts = [co, house, street, lm, loc, po, subdist].filter(Boolean);
                const line1 = addressParts.join(', ');

                return {
                    name,
                    dob: formatDobToISO(dob),
                    gender: formatGender(gender),
                    address: {
                        line1,
                        city: vtc || dist,
                        state,
                        pincode: pc
                    },
                    aadhaarNumber: uid
                };
            } else {
                // Pipe-separated format: UID|Name|DOB|Gender|Address components...
                const parts = qrText.split('|');
                if (parts.length < 4) {
                    throw new Error('Invalid Aadhaar QR format');
                }

                const [uid, name, dob, gender, ...addressParts] = parts;
                
                return {
                    name,
                    dob: formatDobToISO(dob),
                    gender: formatGender(gender),
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
        // Aadhaar DOB format is typically DD-MM-YYYY or DD/MM/YYYY
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
            setIsScanning(true);
            setError(null);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                },
                (decodedText) => {
                    const parsedData = parseAadhaarQR(decodedText);
                    if (parsedData) {
                        handleScanSuccess(parsedData);
                    } else {
                        setError('Invalid Aadhaar QR code. Please try again.');
                    }
                },
                (errorMessage) => {
                    // Ignore continuous scanning errors
                }
            );
        } catch (err: any) {
            console.error('Scanner error:', err);
            setError(`Camera access denied or unavailable: ${err.message}`);
            setIsScanning(false);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                // Check if scanner is running before stopping
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (err: any) {
                // Ignore "not running" errors as they are harmless cleanup races
                if (!err.message?.includes('not running')) {
                    console.error('Error stopping scanner:', err);
                }
            }
        }
        setIsScanning(false);
    };

    const handleScanSuccess = async (data: AadhaarData) => {
        await stopScanner();
        onScanSuccess(data);
    };

    const handleClose = async () => {
        await stopScanner();
        onClose();
    };

    return (
        <div className={`
            ${isFullScreenPage ? 'relative w-full h-full' : 'fixed inset-0 z-[9999] p-0 flex items-center justify-center bg-black/90 backdrop-blur-md'}
            flex flex-col animate-in fade-in duration-200
        `}>
            <div className={`
                ${isFullScreenPage ? 'w-full h-full justify-center px-2' : 'w-[92%] max-w-sm rounded-3xl border border-white/20 shadow-2xl'}
                bg-page flex flex-col overflow-hidden relative
            `}>
                {/* Header */}
                <div className={`p-4 flex items-center justify-between shrink-0 bg-page z-10 ${isFullScreenPage ? '' : 'border-b border-white/10'} relative`}>
                    <div className="w-8"></div> {/* Spacer for centering */}
                    <h3 className="text-base font-bold text-white text-center flex-1">Scan Aadhaar QR</h3>
                    <button onClick={handleClose} className="p-2 -mr-2 hover:bg-white/10 rounded-full transition-colors text-white/80">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Scanner Area - Compact size */}
                <div className={`${isFullScreenPage ? 'aspect-square max-h-[40vh] w-[95%] mx-auto rounded-2xl' : 'flex-1'} relative bg-black overflow-hidden group`}>
                    <div id={qrCodeRegionId} className="absolute inset-0 w-full h-full">
                        <style>{`
                            #${qrCodeRegionId} {
                                width: 100% !important;
                                height: 100% !important;
                            }
                            #${qrCodeRegionId} video {
                                width: 100% !important;
                                height: 100% !important;
                                object-fit: cover !important;
                                display: block !important;
                            }
                            #${qrCodeRegionId} > div {
                                display: none !important;
                            }
                            #${qrCodeRegionId} > video {
                                display: block !important;
                            }
                        `}</style>
                    </div>
                    
                    {/* Overlay Guide - Green Corners */}
                     <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                        <div className="w-56 h-56 relative">
                            {/* Corners */}
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accent rounded-tl-lg" />
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accent rounded-tr-lg" />
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accent rounded-bl-lg" />
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accent rounded-br-lg" />
                            
                            {/* Scanning Animation */}
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent shadow-[0_0_8px_rgba(var(--accent),0.8)] animate-[scan_2s_ease-in-out_infinite] top-[10%]" />
                        </div>
                    </div>

                    {error && (
                        <div className="absolute bottom-4 left-4 right-4 p-3 bg-red-900/90 border border-red-500/50 rounded-lg text-xs text-white text-center z-30 shadow-lg">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer Instructions */}
                <div className={`p-6 bg-page shrink-0 w-full z-10 flex flex-col items-center gap-4 ${isFullScreenPage ? '' : 'border-t border-white/10'}`}>
                    <p className="text-sm text-center text-white/40 max-w-xs leading-relaxed">
                        Align the QR code within the frame to scan automatically
                    </p>
                    <div className="w-full">
                        <Button variant="secondary" onClick={handleClose} className="w-full !bg-white/5 hover:!bg-white/10 !text-white border-none h-12 text-base font-medium rounded-xl">
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AadhaarQrScanner;
