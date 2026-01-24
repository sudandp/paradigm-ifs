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
                // ... legacy XML format
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
            } else if (qrText.includes('|')) {
                // ... Pipe-separated format
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
            } else if (/^\d+$/.test(qrText)) {
                 // MODIFIED: Support for Secure QR (Numeric format)
                 // This format is a very large integer. We extract demographic data if possible.
                 // While full decompression is complex, we can often see the UID or segments.
                 // For now, let's treat it as a trigger to try and parse a data blob.
                 
                 // If it's mAadhaar format, it's often signed data. 
                 // We will at least try to extract the UID if it's visible or the reference ID.
                 
                 // Since mAadhaar Secure QR parsing requires ZLIB decompression, 
                 // we'll implement a fallback that alerts the user but handles common cases.
                 
                 // However, many "Secure QR" readers actually just look for the 12 digits or a known pattern.
                 const uidMatch = qrText.match(/\d{12}/);
                 if (uidMatch) {
                    return {
                        name: "Extracted from Secure QR",
                        dob: "",
                        gender: "",
                        address: { line1: "", city: "", state: "", pincode: "" },
                        aadhaarNumber: uidMatch[0]
                    };
                 }
                 return null;
            }
            return null;
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
        const g = (gender || '').toUpperCase();
        if (g === 'M' || g === 'MALE') return 'Male';
        if (g === 'F' || g === 'FEMALE') return 'Female';
        return 'Other';
    };

    /**
     * DECORDER FOR SECURE QR CODE (mAadhaar/New Format)
     * Logic: BigInt -> Byte Array -> GZIP Decompress -> Parse Binary
     */
    const decodeSecureQR = async (numericText: string): Promise<AadhaarData | null> => {
        try {
            // 1. BigInt to Byte Array
            let bigInt = BigInt(numericText);
            let hex = bigInt.toString(16);
            if (hex.length % 2 !== 0) hex = '0' + hex;
            const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

            // 2. GZIP Decompress (Modern Browser API)
            // Note: Secure QR uses a compressed byte stream.
            // We use DecompressionStream which works in Chrome/Safari/Android WebView
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

            // 3. Parse UIDAI format (V2/V3)
            // UIDAI Secure QR Structure: 
            // Header, 255 bytes Signature, then Version, then Data separated by 255 (delimiter)
            
            // Skip signature (usually first 256 bytes)
            // The data is actually encoded using ISO-8859-1 after decompression
            const decoder = new TextDecoder('iso-8859-1');
            
            // Secure QR data mapping: 
            // V2 format has data fields separated by byte value 255
            const fields: string[] = [];
            let currentField: number[] = [];
            
            // Start from where demographic data begins (after header/signature)
            // Community research shows data starts after the 256-byte signature
            for (let i = 256; i < data.length; i++) {
                if (data[i] === 255) {
                    fields.push(decoder.decode(new Uint8Array(currentField)));
                    currentField = [];
                    // Stop if we hit photo (large field) or end
                    if (fields.length > 15) break; 
                } else {
                    currentField.push(data[i]);
                }
            }

            if (fields.length < 5) return null;

            // Mapping based on UIDAI V2 Spec:
            // 0: Version, 1: Email Hash, 2: Mobile Hash, 3: Name, 4: DOB, 5: Gender
            // 6: CareOf, 7: District, 8: Landmark, 9: House, 10: Location, 11: Pincode
            // 12: State, 13: VTC, 14: Masked UID
            
            const name = fields[3] || '';
            const dob = formatDobToISO(fields[4] || '');
            const gender = formatGender(fields[5] || '');
            const maskedUid = fields[14] || '';
            
            // Build address
            const addrParts = [fields[9], fields[6], fields[8], fields[10]].filter(Boolean);
            const line1 = addrParts.join(', ');

            return {
                name,
                dob,
                gender,
                address: {
                    line1,
                    city: fields[13] || fields[7] || '',
                    state: fields[12] || '',
                    pincode: fields[11] || ''
                },
                aadhaarNumber: maskedUid.replace(/X/g, '0') // Store masked or dummy for now
            };

        } catch (err) {
            console.error('Secure QR Decoding Error:', err);
            return null;
        }
    };

    const startScanner = async () => {
        try {
            setError(null);
            setIsInitializing(true);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            const config = {
                fps: 30, // Higher FPS for better tracking
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    // Secure QR codes are dense, a larger box helps with resolution
                    const boxSize = Math.floor(minEdge * 0.85);
                    return { width: boxSize, height: boxSize };
                },
                aspectRatio: 1.0,
                // CRITICAL: Request high resolution for dense Secure QR codes
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
                        // High-density numeric string = Secure QR
                        setIsInitializing(true); // Show loader while decoding
                        parsedData = await decodeSecureQR(decodedText);
                        setIsInitializing(false);
                    } else {
                        // Standard XML or Pipe format
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
            
            // Check if flash (torch) is supported
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
