import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Zap, ZapOff, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

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
    const [isScanningFile, setIsScanningFile] = useState(false);
    const [scannedData, setScannedData] = useState<AadhaarData | null>(null);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const qrCodeRegionId = "qr-reader-full-page";

    // --- Helper Functions ---
    const formatNameToTitleCase = (value: string | undefined) => {
        if (!value) return '';
        return value.toLowerCase().replace(/\b(\w)/g, s => s.toUpperCase());
    };

    const formatDobToISO = (dob: string): string => {
        if (!dob) return '';
        // Aggressively remove non-date characters (hidden binary bits)
        const cleaned = dob.replace(/[^-/0-9]/g, '').trim();
        
        // If already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
        
        const parts = cleaned.split(/[-/]/);
        if (parts.length === 3) {
            const [p1, p2, p3] = parts;
            // Determine if p1 or p3 is the year
            const year = p3.length === 4 ? p3 : (p1.length === 4 ? p1 : '');
            const day = p3.length === 4 ? p1 : (p1.length === 4 ? p3 : '');
            const month = p2.padStart(2, '0');
            const d = day.padStart(2, '0');
            
            if (year) return `${year}-${month}-${d}`;
        }
        return cleaned;
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
            
            // Start from 0 to match our successful diagnostic dump
            for (let i = 0; i < data.length; i++) {
                if (data[i] === 255) {
                    fields.push(textDecoder.decode(new Uint8Array(currentFieldBytes)));
                    currentFieldBytes = [];
                    // Keep scanning fields until we hit the photo/end
                    if (fields.length > 30) break; 
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
            const layout = fields[14] || ''; // Raja Reddy Layout in your V5 card
            const locality = fields[10] || ''; // Ramamurthi Nagar
            const landmark = fields[8] || ''; // 39 m from Rakesh Kumar Fuel
            const subLocality = fields[16] || ''; // Ramammurthynagar
            const town = fields[12] || ''; // Doorvaninagar
            const city = fields[7] || ''; // Bengaluru
            const state = fields[13] || ''; // Karnataka
            const pincode = fields[11] || ''; // 560016
            
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
                aadhaarNumber: maskedMobile || 'QR-VERIFIED', 
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
                // Don't call clear() immediately if we might need the object for file scanning
                // but for this implementation we recreate it if needed.
            } catch (err) {
                console.error('Error stopping scanner:', err);
            }
        }
    };

    const handleScanSuccess = async (aadhaarData: AadhaarData) => {
        await stopScanner();
        setScannedData(aadhaarData);
        setIsReviewOpen(true);
    };

    const confirmAndFill = () => {
        if (!scannedData) return;
        
        const aadhaarData = scannedData;
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
            idProofNumber: aadhaarData.mobile || 'QR-VERIFIED', 
            mobile: aadhaarData.mobile,
            email: aadhaarData.email,
            isQrVerified: true
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

        navigate('/onboarding/add/personal');
    };

    const startScanner = async () => {
        try {
            setError(null);
            setIsInitializing(true);

            const html5QrCode = new Html5Qrcode(qrCodeRegionId);
            scannerRef.current = html5QrCode;

            const config = {
                fps: 60, // Increased FPS for better tracking
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const boxSize = Math.floor(minEdge * 0.95); // Even larger box for dense codes
                    return { width: boxSize, height: boxSize };
                },
                aspectRatio: 1.0,
                videoConstraints: {
                    facingMode: "environment",
                    width: { min: 1280, ideal: 1920, max: 2560 }, // Request high res
                    height: { min: 720, ideal: 1080, max: 1440 },
                    frameRate: { ideal: 60 }
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
        if (scannerRef.current?.isScanning) {
            scannerRef.current.stop().then(() => startScanner());
        } else {
            startScanner();
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setIsScanningFile(true);
            setError(null);
            
            // 0. Preliminary: Stop camera if running
            if (scannerRef.current?.isScanning) {
                await scannerRef.current.stop();
            }

            // Create a temporary scanner instance if needed
            const html5QrCode = scannerRef.current || new Html5Qrcode(qrCodeRegionId);
            
            let decodedText = '';

            // 1. FIRST PASS: Native html5-qrcode file scanning (often better at thresholding)
            try {
                decodedText = await html5QrCode.scanFile(file, false);
            } catch (scanErr) {
                // Native engine failed, move to custom jsQR pipeline
                console.log("Native file scan failed, trying custom pipeline...");
            }

            // 2. SECOND PASS: Custom jsQR Multi-filter Pipeline
            if (!decodedText) {
                decodedText = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d', { willReadFrequently: true });
                            if (!ctx) return reject(new Error('Canvas setup failed'));

                            // Optimization: If image is huge, downscale it to help jsQR
                            const MAX_DIM = 1200;
                            let width = img.width;
                            let height = img.height;
                            if (width > MAX_DIM || height > MAX_DIM) {
                                if (width > height) {
                                    height = Math.floor((MAX_DIM / width) * height);
                                    width = MAX_DIM;
                                } else {
                                    width = Math.floor((MAX_DIM / height) * width);
                                    height = MAX_DIM;
                                }
                            }
                            canvas.width = width;
                            canvas.height = height;

                            const tryPass = (filter: string) => {
                                ctx.filter = filter;
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                return jsQR(imageData.data, canvas.width, canvas.height);
                            };

                            // Aggressive retry logic with different levels of processing
                            let code = tryPass('none');
                            if (!code) code = tryPass('contrast(130%) grayscale(100%)');
                            if (!code) code = tryPass('contrast(160%) brightness(110%) grayscale(100%)');
                            if (!code) code = tryPass('contrast(300%) grayscale(100%)'); // Thresholding-like
                            if (!code) code = tryPass('contrast(100%) brightness(140%) grayscale(100%)'); // Very dark
                            if (!code) code = tryPass('invert(100%) contrast(120%) grayscale(100%)'); // Inverted version

                            if (code) resolve(code.data);
                            else reject(new Error('No QR code found after multiple checks'));
                        };
                        img.src = e.target?.result as string;
                    };
                    reader.readAsDataURL(file);
                });
            }

            // 3. Decoding logic
            let parsedData: AadhaarData | null = null;
            if (/^\d+$/.test(decodedText) && decodedText.length > 500) {
                parsedData = await decodeSecureQR(decodedText);
            } else {
                parsedData = parseAadhaarQR(decodedText);
            }

            if (parsedData) {
                handleScanSuccess(parsedData);
            } else {
                setError("Decoded text did not contain valid Aadhaar data. Please ensure it's a Secure Aadhaar QR.");
            }
        } catch (err: any) {
            console.error('File scan error:', err);
            setError("Could not find a clear Aadhaar QR in this image. Please ensure the QR is flat, well-lit, and not blurry.");
        } finally {
            setIsScanningFile(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
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
        if (!isReviewOpen) {
            const timer = setTimeout(() => {
                startScanner();
            }, 500);
            
            return () => {
                clearTimeout(timer);
                stopScanner();
            };
        } else {
            stopScanner();
        }
    }, [isReviewOpen]);

    if (isReviewOpen && scannedData) {
        return (
            <div className="fixed inset-0 z-[300] flex flex-col bg-[#01140a] text-white animate-fade-in">
                <header className="p-6 border-b border-emerald-900/30 flex items-center gap-4">
                    <Button 
                        variant="icon" 
                        className="!text-white bg-white/5 hover:!bg-white/10 !p-2 !rounded-full" 
                        onClick={() => setIsReviewOpen(false)}
                    >
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h2 className="text-xl font-bold tracking-tight">Verify Extracted Details</h2>
                </header>

                <main className="flex-1 overflow-y-auto p-6 space-y-8">
                    <div className="flex items-center gap-4 p-5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                        <div className="h-12 w-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <CheckCircle2 className="h-7 w-7 text-white" />
                        </div>
                        <div>
                            <h4 className="font-bold text-emerald-400">Scan Successful!</h4>
                            <p className="text-sm text-white/50">Please verify the details below before proceeding.</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <section className="space-y-1 border-l-2 border-emerald-500/30 pl-4">
                            <label className="text-[10px] uppercase font-black text-emerald-500/60 tracking-widest block">Full Name</label>
                            <p className="font-bold text-2xl text-white leading-tight">{scannedData.name}</p>
                        </section>

                        <div className="grid grid-cols-2 gap-8">
                            <section className="space-y-1 border-l-2 border-emerald-500/30 pl-4">
                                <label className="text-[10px] uppercase font-black text-emerald-500/60 tracking-widest block">Date of Birth</label>
                                <p className="font-bold text-lg text-white">{scannedData.dob}</p>
                            </section>
                            <section className="space-y-1 border-l-2 border-emerald-500/30 pl-4">
                                <label className="text-[10px] uppercase font-black text-emerald-500/60 tracking-widest block">Gender</label>
                                <p className="font-bold text-lg text-white">{scannedData.gender}</p>
                            </section>
                        </div>

                        <section className="space-y-2 border-l-2 border-emerald-500/30 pl-4">
                            <label className="text-[10px] uppercase font-black text-emerald-500/60 tracking-widest block">Verified Address</label>
                            <p className="text-sm leading-relaxed text-white/80">{scannedData.address.line1}</p>
                            <div className="inline-flex mt-2 px-3 py-1 bg-emerald-950/50 border border-emerald-800/30 rounded-lg">
                                <p className="text-sm font-bold text-emerald-400">
                                    {scannedData.address.city}, {scannedData.address.state} - {scannedData.address.pincode}
                                </p>
                            </div>
                        </section>
                    </div>
                </main>

                <footer className="p-6 pt-0 bg-gradient-to-t from-[#01140a] via-[#01140a] to-transparent">
                     <div className="flex flex-col gap-3">
                        <Button 
                            className="w-full !rounded-2xl !py-4 font-bold text-lg shadow-xl shadow-emerald-900/20"
                            onClick={confirmAndFill}
                        >
                            Confirm & Auto-Fill
                        </Button>
                        <Button 
                            variant="secondary"
                            className="w-full !rounded-2xl !py-4 !bg-white/5 !border-white/10 !text-white/60 font-medium"
                            onClick={() => setIsReviewOpen(false)}
                        >
                            Rescan QR Code
                        </Button>
                     </div>
                </footer>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[250] flex flex-col bg-black text-white">
            <header className="p-6 border-b border-emerald-900/30 flex items-center gap-4 bg-gradient-to-b from-[#01140a] to-transparent">
                <Button 
                    variant="icon" 
                    className="!text-white bg-white/5 hover:!bg-white/10 !p-2 !rounded-full" 
                    onClick={() => navigate(-1)}
                >
                    <ArrowLeft className="h-6 w-6" />
                </Button>
                <h2 className="text-xl font-bold tracking-tight flex-1">Scan Aadhaar QR</h2>
                
                {hasFlash && (
                    <Button 
                        variant="icon" 
                        className={`!p-2 !rounded-full ${isFlashOn ? 'bg-yellow-500/20 !text-yellow-400' : 'bg-white/5 !text-white'} hover:!bg-white/10`}
                        onClick={toggleFlash}
                    >
                        {isFlashOn ? <Zap className="h-6 w-6" /> : <ZapOff className="h-6 w-6" />}
                    </Button>
                )}
            </header>

            <div className="flex-grow relative flex items-center justify-center overflow-hidden bg-black">
                {isInitializing && !isScanningFile && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black">
                        <Loader2 className="h-12 w-12 animate-spin text-accent" />
                        <p className="mt-4 text-white/70 font-medium">Initializing scanner...</p>
                    </div>
                )}

                {isScanningFile && (
                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                        <Loader2 className="h-12 w-12 animate-spin text-white" />
                        <p className="mt-4 text-white font-medium text-lg">Processing Image...</p>
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
                        <div className="w-80 h-80 border-2 border-accent rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                            <div className="absolute inset-x-0 h-0.5 bg-accent/50 shadow-[0_0_15px_#006b3f] animate-[scan_2s_linear_infinite]"></div>
                            <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-accent rounded-tl-xl"></div>
                            <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-accent rounded-tr-xl"></div>
                            <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-accent rounded-bl-xl"></div>
                            <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-accent rounded-br-xl"></div>
                        </div>
                        <h3 className="mt-6 text-xl font-bold text-white drop-shadow-md">Scan Aadhaar QR</h3>
                        <p className="mt-3 text-white/80 text-sm font-medium px-6 text-center">
                            Hold the QR code within the square to scan
                        </p>
                    </div>
                )}
            </div>

            <div className="absolute bottom-[61px] left-0 right-0 px-6 pb-4 z-40 flex flex-col gap-4 items-center">
                 {!isInitializing && !isScanningFile && (
                    <div className="flex flex-col gap-3 w-full max-w-sm">
                        <div className="flex gap-4">
                            <Button 
                                variant="secondary" 
                                className="flex-1 !rounded-2xl !py-5 !bg-white/10 !border-white/20 !text-white hover:!bg-white/20 backdrop-blur-md shadow-lg text-lg font-bold"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="h-6 w-6 mr-3" />
                                Upload Image
                            </Button>
                            <Button 
                                variant="icon" 
                                className="!rounded-2xl !bg-white/10 !border-white/20 !text-white hover:!bg-white/20 backdrop-blur-md shadow-lg !p-5"
                                onClick={handleRetry}
                            >
                                <RefreshCw className="h-7 w-7" />
                            </Button>
                        </div>
                    </div>
                 )}

                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileUpload}
                 />
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
