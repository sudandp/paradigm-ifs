import fs from 'fs';
let css = fs.readFileSync('index.css', 'utf8');

// Basic minification
css = css.replace(/\/\*[\s\S]*?\*\//g, ''); // Remove comments
css = css.replace(/\s+/g, ' '); // Collapse whitespace
css = css.replace(/\s*([{};:])\s*/g, '$1'); // Remove spaces around delimiters
css = css.replace(/^\s+|\s+$/g, ''); // Trim

// Re-add tailwind directives with newlines
css = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n" + css.replace(/@tailwind base;?|@tailwind components;?|@tailwind utilities;?/g, '').trim();

fs.writeFileSync('index.css', css);
console.log('index.css cleaned and minified');
