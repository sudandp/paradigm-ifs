// The logo is a local image path to prevent CORS issues during PDF generation and to use the new logo.
// Use a local asset for the default logo instead of an external URL.  This points to
// the bundled image file located at the project root.  Keeping the logo local
// prevents external network requests during PDF generation and avoids CORS issues.
export const originalDefaultLogoBase64 = 'https://fmyafuhxlorbafbacywa.supabase.co/storage/v1/object/sign/logo/Paradigm-Logo-3-1024x157.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MDgwNWUxZC0yMTk2LTQxMjktYjUwMC0yMGZiYzgwN2I3NjUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJsb2dvL1BhcmFkaWdtLUxvZ28tMy0xMDI0eDE1Ny5wbmciLCJpYXQiOjE3NjM2MTQwNzUsImV4cCI6MjA3ODk3NDA3NX0.TYFTGDrqZ3frG3wS6gbF5TQchyBX3kb2VV49Il4X-34';

// Local path for the logo, used specifically for client-side PDF generation
export const pdfLogoLocalPath = 'https://fmyafuhxlorbafbacywa.supabase.co/storage/v1/object/sign/logo/Paradigm-Logo-3-1024x157.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV82MDgwNWUxZC0yMTk2LTQxMjktYjUwMC0yMGZiYzgwN2I3NjUiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJsb2dvL1BhcmFkaWdtLUxvZ28tMy0xMDI0eDE1Ny5wbmciLCJpYXQiOjE3NjM2MTQwNzUsImV4cCI6MjA3ODk3NDA3NX0.TYFTGDrqZ3frG3wS6gbF5TQchyBX3kb2VV49Il4X-34';