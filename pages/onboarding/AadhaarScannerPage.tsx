import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import Button from '../../components/ui/Button';

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

const AadhaarScannerPage: React.FC = () => {
    const navigate = useNavigate();
    const store = useOnboardingStore();
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const qrCodeRegionId = "qr-reader-full-page";

    useEffect(() => {
        // Start scanner with a small delay to ensure DOM is ready
        const timer = setTimeout(() => {
            startScanner();
        }, 500);
        
        return () => {
            clearTimeout(timer);
            stopScanner();
        };
    }, []);

    const formatNameToTitleCase = (value: string | undefined) => {
        if (!value) return '';
        return value.toLowerCase().replace(/\b(\w)/g, s => s.toUpperCase());
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
                const house = xmlDoc.querySelector('house')?.textContent || '';
                const street = xmlDoc.querySelector('street')?.textContent || '';
                const loc = xmlDoc.querySelector('loc')?.textContent || '';
                const vtc = xmlDoc.querySelector('vtc')?.textContent || '';
                const dist = xmlDoc.querySelector('dist')?.textContent || '';
                const state = xmlDoc.querySelector('state')?.textContent || '';
                const pc = xmlDoc.querySelector('pc')?.textContent || '';

                const addressParts = [house, street, loc].filter(Boolean);
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
                const parts = qrText.split('|');
                if (parts.length < 4) throw new Error('Invalid format');

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
            setError(null);
            setIsInitializing(true);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 20,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const boxSize = Math.floor(minEdge * 0.7);
                        return { width: boxSize, height: boxSize };
                    },
                    aspectRatio: 1.0,
                },
                (decodedText) => {
                    const parsedData = parseAadhaarQR(decodedText);
                    if (parsedData) {
                        handleScanSuccess(parsedData);
                    }
                },
                () => {}
            );
            setIsInitializing(false);
        } catch (err: any) {
            console.error('Scanner error:', err);
            setError(`Camera error: ${err.message || 'Access denied'}`);
            setIsInitializing(false);
        }
    };

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
        }
    };

    const handleScanSuccess = async (aadhaarData: AadhaarData) => {
        await stopScanner();
        
        const nameParts = aadhaarData.name.split(' ');
        const firstName = formatNameToTitleCase(nameParts.shift() || '');
        const lastName = formatNameToTitleCase(nameParts.pop() || '');
        const middleName = formatNameToTitleCase(nameParts.join(' '));

        store.updatePersonal({
            firstName,
            lastName,
            middleName,
            preferredName: firstName,
            dob: aadhaarData.dob,
            gender: aadhaarData.gender as any,
            idProofType: 'Aadhaar',
            idProofNumber: aadhaarData.aadhaarNumber
        });

        store.updateAddress({
            present: {
                ...aadhaarData.address,
                country: 'India',
                verifiedStatus: {
                    line1: true,
                    city: true,
                    state: true,
                    pincode: true,
                    country: true
                }
            },
            permanent: {
                ...aadhaarData.address,
                country: 'India'
            },
            sameAsPresent: true
        });

        store.setPersonalVerifiedStatus({
            name: true,
            dob: true,
            idProofNumber: true
        });

        navigate('/onboarding/add/personal');
    };

    const handleRetry = () => {
        stopScanner();
        startScanner();
    };

    return (
        <div className="fixed inset-0 z-[250] flex flex-col bg-black text-white">
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent z-50 flex justify-between items-center">
                <Button variant="icon" className="!text-white hover:!bg-white/20 !p-2" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <h3 className="text-lg font-bold flex-1 text-center">Scan Aadhaar QR</h3>
                <div className="w-10"></div>
            </div>

            <div className="flex-grow relative flex items-center justify-center overflow-hidden bg-black">
                {isInitializing && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black">
                        <Loader2 className="h-12 w-12 animate-spin text-accent" />
                        <p className="mt-4 text-white/70 font-medium">Initializing scanner...</p>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center text-white p-6 text-center bg-black/80">
                        <p className="mb-6 text-red-400">{error}</p>
                        <div className="flex gap-4">
                            <Button onClick={handleRetry} className="!rounded-full !px-6">Try Again</Button>
                            <Button onClick={() => navigate(-1)} variant="secondary" className="!rounded-full !px-6">Cancel</Button>
                        </div>
                    </div>
                )}

                <div 
                    id={qrCodeRegionId} 
                    className="w-full h-full max-h-screen [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
                ></div>

                {!isInitializing && !error && (
                    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col items-center justify-center">
                        <div className="w-64 h-64 border-2 border-accent rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                            <div className="absolute inset-x-0 h-0.5 bg-accent/50 shadow-[0_0_15px_#006b3f] animate-[scan_2s_linear_infinite]"></div>
                            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-accent rounded-tl-lg"></div>
                            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-accent rounded-tr-lg"></div>
                            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-accent rounded-bl-lg"></div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-accent rounded-br-lg"></div>
                        </div>
                        <p className="mt-8 text-white/80 text-sm font-medium px-6 text-center">
                            Hold the QR code within the square to scan
                        </p>
                    </div>
                )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 to-transparent z-40 flex justify-center">
                 {!isInitializing && (
                    <Button 
                        variant="secondary" 
                        className="!rounded-full !bg-white/10 !border-white/20 !text-white hover:!bg-white/20"
                        onClick={handleRetry}
                    >
                        <RefreshCw className="h-5 w-5 mr-2" />
                        Reload Camera
                    </Button>
                 )}
            </div>

            <style>{`
                @keyframes scan {
                    0% { top: 0; }
                    50% { top: 100%; }
                    100% { top: 0; }
                }
                #${qrCodeRegionId} > div {
                    display: none !important;
                }
                #${qrCodeRegionId} video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                }
            `}</style>
        </div>
    );
};

export default AadhaarScannerPage;
