import fs from 'fs';
const customCss = fs.readFileSync('custom.css', 'utf8');

const theme = `@import "tailwindcss";

@theme {
  --color-accent: #006B3F;
  --color-accent-dark: #005632;
  --color-page: #F9FAFB;
  --color-card: #FFFFFF;
  --color-muted: #6B7280;
  --color-primary-text: #0F172A;
  --color-border: #E6EEF3;
  --color-accent-light: rgba(0, 107, 63, 0.1);

  --shadow-card: 0 6px 18px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;

  --font-sans: "Manrope", system-ui, sans-serif;
}

`;

fs.writeFileSync('index.css', theme + customCss);
console.log('index.css rebuilt with Tailwind 4 syntax and custom styles');
