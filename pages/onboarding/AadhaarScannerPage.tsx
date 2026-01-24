import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Zap, ZapOff } from 'lucide-react';
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
    dataAsOn?: string;
    mobile?: string;
    email?: string;
}

const AadhaarScannerPage: React.FC = () => {
    const navigate = useNavigate();
    const store = useOnboardingStore();
    const [isInitializing, setIsInitializing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [hasFlash, setHasFlash] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const qrCodeRegionId = "qr-reader-full-page";

    // --- Helper Functions ---
    const formatNameToTitleCase = (value: string | undefined) => {
        if (!value) return '';
        return value.toLowerCase().replace(/\b(\w)/g, s => s.toUpperCase());
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
        const g = (gender || '').toUpperCase();
        if (g === 'M' || g === 'MALE') return 'Male';
        if (g === 'F' || g === 'FEMALE') return 'Female';
        return 'Other';
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
            }
            return null;
        } catch (err) {
            return null;
        }
    };

    const decodeSecureQR = async (numericText: string): Promise<AadhaarData | null> => {
        try {
            let bigInt = BigInt(numericText);
            let hex = bigInt.toString(16);
            if (hex.length % 2 !== 0) hex = '0' + hex;
            const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

            const stream = new ReadableStream({
                start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                }
            });

            const decompressedStream = stream.pipeThrough(new (window as any).DecompressionStream('gzip'));
            const reader = decompressedStream.getReader();
            const chunks: Uint8Array[] = [];
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) chunks.push(value as Uint8Array);
            }

            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const data = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                data.set(chunk, offset);
                offset += chunk.length;
            }

            const textDecoder = new TextDecoder('iso-8859-1');
            const fields: string[] = [];
            let currentFieldBytes: number[] = [];
            
            for (let i = 256; i < data.length; i++) {
                if (data[i] === 255) {
                    fields.push(textDecoder.decode(new Uint8Array(currentFieldBytes)));
                    currentFieldBytes = [];
                    if (fields.length > 20) break; 
                } else {
                    currentFieldBytes.push(data[i]);
                }
            }

            if (fields.length < 5) return null;

            const name = fields[3] || '';
            const dobRaw = fields[4] || '';
            const genderRaw = fields[5] || '';
            const maskedMobile = fields[17] || '';
            const maskedEmail = fields[18] || '';

            const house = fields[9] || '';
            const layout = fields[14] || '';
            const locality = fields[10] || '';
            const landmark = fields[8] || '';
            const subLocality = fields[16] || '';
            const town = fields[12] || '';
            const city = fields[7] || '';
            const state = fields[13] || '';
            const pincode = fields[11] || '';
            
            const addrParts = [
                house, 
                layout, 
                locality, 
                landmark, 
                subLocality, 
                town, 
                city, 
                `${state} - ${pincode}`
            ].filter(Boolean);

            const fullAddress = addrParts.join(', ');

            return {
                name,
                dob: formatDobToISO(dobRaw),
                gender: formatGender(genderRaw),
                address: {
                    line1: fullAddress,
                    city: city,
                    state: state,
                    pincode: pincode
                },
                aadhaarNumber: '', 
                mobile: maskedMobile,
                email: maskedEmail
            };

        } catch (err) {
            console.error('Secure QR Decoding Error:', err);
            return null;
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
            idProofNumber: '', 
            mobile: aadhaarData.mobile,
            email: aadhaarData.email
        });

        store.updateAddress({
            present: {
                line1: aadhaarData.address.line1,
                city: aadhaarData.address.city,
                state: aadhaarData.address.state,
                pincode: aadhaarData.address.pincode,
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
                line1: aadhaarData.address.line1,
                city: aadhaarData.address.city,
                state: aadhaarData.address.state,
                pincode: aadhaarData.address.pincode,
                country: 'India'
            },
            sameAsPresent: true
        });

        store.setPersonalVerifiedStatus({
            name: true,
            dob: true,
            idProofNumber: false,
            email: !!aadhaarData.email
        });

        store.setIsQrVerified(true);

        navigate('/onboarding/add/personal');
    };

    const startScanner = async () => {
        try {
            setError(null);
            setIsInitializing(true);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            const config = {
                fps: 30,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const boxSize = Math.floor(minEdge * 0.85);
                    return { width: boxSize, height: boxSize };
                },
                aspectRatio: 1.0,
                videoConstraints: {
                    facingMode: "environment",
                    width: { min: 1280, ideal: 1920, max: 2560 },
                    height: { min: 720, ideal: 1080, max: 1440 },
                }
            };

            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                async (decodedText) => {
                    let parsedData: AadhaarData | null = null;
                    
                    if (/^\d+$/.test(decodedText) && decodedText.length > 500) {
                        setIsInitializing(true);
                        parsedData = await decodeSecureQR(decodedText);
                        setIsInitializing(false);
                    } else {
                        parsedData = parseAadhaarQR(decodedText);
                    }

                    if (parsedData) {
                        try {
                            if (window.navigator && window.navigator.vibrate) {
                                window.navigator.vibrate(100);
                            }
                        } catch (e) {}
                        handleScanSuccess(parsedData);
                    }
                },
                () => {}
            );
            
            try {
                const capabilities = await html5QrCode.getRunningTrackCapabilities();
                if (capabilities && (capabilities as any).torch) {
                    setHasFlash(true);
                }
            } catch (e) {
                console.log("Torch capability check failed", e);
            }
            
            setIsInitializing(false);
        } catch (err: any) {
            console.error('Scanner error:', err);
            setError(`Camera error: ${err.message || 'Access denied'}`);
            setIsInitializing(false);
        }
    };

    const handleRetry = () => {
        setIsFlashOn(false);
        stopScanner();
        startScanner();
    };

    const toggleFlash = async () => {
        if (!scannerRef.current || !hasFlash) return;
        try {
            const newState = !isFlashOn;
            await scannerRef.current.applyVideoConstraints({
                advanced: [{ torch: newState }]
            } as any);
            setIsFlashOn(newState);
        } catch (err) {
            console.error('Flash toggle failed:', err);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            startScanner();
        }, 500);
        
        return () => {
            clearTimeout(timer);
            stopScanner();
        };
    }, []);

    return (
        <div className="fixed inset-0 z-[250] flex flex-col bg-black text-white">
            <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/70 to-transparent z-50 flex items-center justify-between">
                <Button 
                    variant="icon" 
                    className="!text-white bg-black/40 backdrop-blur-md hover:!bg-black/60 !p-3 !rounded-full shadow-2xl border border-white/20" 
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft className="h-8 w-8" />
                </Button>
                
                {hasFlash && (
                    <Button 
                        variant="icon" 
                        className={`!p-3 !rounded-full bg-black/40 backdrop-blur-md border border-white/20 ${isFlashOn ? '!text-yellow-400' : '!text-white'}`}
                        onClick={toggleFlash}
                    >
                        {isFlashOn ? <Zap className="h-7 w-7" /> : <ZapOff className="h-7 w-7" />}
                    </Button>
                )}
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
                        <h3 className="mt-6 text-xl font-bold text-white drop-shadow-md">Scan Aadhaar QR</h3>
                        <p className="mt-3 text-white/80 text-sm font-medium px-6 text-center">
                            Hold the QR code within the square to scan
                        </p>
                    </div>
                )}
            </div>

            <div className="absolute bottom-20 left-0 right-0 p-4 z-40 flex justify-end">
                 {!isInitializing && (
                    <Button 
                        variant="secondary" 
                        className="!rounded-full !bg-black/60 !border-white/20 !text-white hover:!bg-black/80 shadow-lg"
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
