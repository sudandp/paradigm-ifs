import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/<style>([\s\S]*?)<\/style>/);
if (match) {
  const css = "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n" + match[1];
  fs.writeFileSync('index.css', css);
  console.log('CSS extracted successfully');
} else {
  console.log('No style tag found');
}
