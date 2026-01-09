import fs from 'fs';
let html = fs.readFileSync('index.html', 'utf8');

// Remove Tailwind CDN script and config
html = html.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*<script>[\s\S]*?<\/script>/, '');

// Remove the massive internal style block
html = html.replace(/<style>[\s\S]*?<\/style>/, '');

// Clean up redundant link to index.css if it exists and moves it to a better position
html = html.replace(/<link rel="stylesheet" href="\/index\.css">/, '');

// Add preloads and proper index.css link near the top of head
const headStart = html.indexOf('<head>') + 6;
const optimizations = `
    <link rel="preload" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" as="style">
    <link rel="stylesheet" href="/index.css">`;

html = html.slice(0, headStart) + optimizations + html.slice(headStart);

// Remove extra empty lines caused by deletions
html = html.replace(/\n\s*\n\s*\n/g, '\n\n');

fs.writeFileSync('index.html', html);
console.log('index.html optimized successfully');
