const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'pages');

function findTsxFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findTsxFiles(filePath, fileList);
    } else if (filePath.endsWith('.tsx') && !filePath.includes('LeaveDashboard.tsx') && !filePath.includes('App.tsx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = findTsxFiles(pagesDir);
let patchedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Check if it has something like: if (isLoading) return ...
  // Or check for other simple loading returns.
  // We'll use a regex to match common loading return patterns.
  
  // Strategy:
  // 1. Check if the file contains `isLoading` or `loading`.
  // 2. Look for `if (isLoading) return <div...` or `if (loading) return <Loader2...`
  const loadingReturnRegex = /if\s*\(\s*(isLoading|loading|isDataLoading|isSubmitting)\s*\)\s*(?:\{\s*return\s+|<(?:div|div className=[^>]+)>)?(?:<Loader2[^>]*>|<\w+[^>]*>Loading(?:\\.+)?[<\/\w+>]|return\s+<div[^>]*>.*?<\/div>\s*;|return\s+<Loader2[^>]*>\s*;|return\s+<div[^>]*>[\s\S]*?<\/div>\s*;\s*\}|return\s*\(?\s*<div[^>]*>[\s\S]*?<\/div>\s*\)?\s*;?\s*\}?)/gi;

  let hasModifications = false;

  // Advanced regex to catch multiple variations of loading returns cleanly
  // e.g.
  // if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  // if (isLoading) return <div className="p-6 text-center">Loading...</div>;
  // if (isLoading) { return <div...>...</div>; }
  
  // A safer approach is to replace any `if (isLoading) return ...;` where it spans up to 5 lines when it contains 'Loading' or 'Loader2' or 'animate-spin'
  
  const blocks = content.split('\n');
  for (let i = 0; i < blocks.length; i++) {
    const line = blocks[i];
    if (line.match(/if\s*\(\s*(isLoading|loading|isDataLoading)\s*\)/) && !line.includes('LoadingScreen')) {
      // Find the end of the return statement
      let endIdx = i;
      let returnText = line;
      while (endIdx < i + 15 && endIdx < blocks.length) { // search forward
        if (returnText.includes(';') || (returnText.includes('}') && line.includes('{'))) {
             break;
        }
        endIdx++;
        if (endIdx < blocks.length) returnText += '\n' + blocks[endIdx];
      }
      
      if (returnText.includes('return') && (returnText.includes('<div') || returnText.includes('<Loader') || returnText.includes('Loading'))) {
         let replacement = `    if (${line.match(/if\s*\(\s*([a-zA-Z0-9_]+)\s*\)/)[1]}) {\n        return <LoadingScreen message="Loading page data..." />;\n    }`;
         
         // Replace the block
         blocks.splice(i, endIdx - i + 1, replacement);
         hasModifications = true;
         // Adjust index since we changed array length
         // Note: the replaced block is 1 array element now (split by \n later if we want, or just joined)
      }
    }
  }

  if (hasModifications) {
    content = blocks.join('\n');
  }

  // Also replace inline loading logic like:
  // isLoading ? <LoadingScreen...> : ...
  // Or cases where it is just simple returns that the above loop missed.
  const regex2 = /if\s*\(\s*(isLoading|loading|isDataLoading)\s*\)\s*return\s*<[A-Za-z0-9_\-\s="'{}()]+>[\s\S]*?<\/[A-Za-z0-9_]+>;/g;
  if (content.match(regex2)) {
    content = content.replace(regex2, match => {
       if (match.includes('LoadingScreen')) return match;
       const varName = match.match(/if\s*\(\s*([a-zA-Z0-9_]+)\s*\)/)[1];
       return `if (${varName}) return <LoadingScreen message="Loading page data..." />;`;
    });
    hasModifications = true;
  }

  const regex3 = /if\s*\(\s*(isLoading|loading)\s*\)\s*\{\s*return\s*\(?\s*<div[^>]*>[\s\S]*?<\/div>\s*\)?\s*;\s*\}/g;
  if (content.match(regex3)) {
     content = content.replace(regex3, match => {
        if (match.includes('LoadingScreen')) return match;
        const varName = match.match(/if\s*\(\s*([a-zA-Z0-9_]+)\s*\)/)[1];
        return `if (${varName}) {\n        return <LoadingScreen message="Loading page data..." />;\n    }`;
     });
     hasModifications = true;
  }

  // Add the import if needed
  if (hasModifications && content !== originalContent && !content.includes('LoadingScreen')) {
    // Determine relative path depth
    const relativeDepth = path.relative(path.dirname(file), pagesDir).split(path.sep).length;
    let upDir = '../'.repeat(relativeDepth);
    if (!upDir) upDir = './';
    // Actually from any page to components/ui/LoadingScreen
    // Pages are in `pages/`, components are in `components/`.
    // So if file is in `pages/admin/XYZ.tsx`, depth is `../../components/ui/LoadingScreen`
    // If in `pages/XYZ.tsx`, depth is `../components/ui/LoadingScreen`
    const pathParts = file.split(path.sep);
    const pagesIndex = pathParts.indexOf('pages');
    const nestedLevel = pathParts.length - pagesIndex - 1; // 1 for pages/X.tsx, 2 for pages/a/X.tsx
    let importPath = '';
    if (nestedLevel === 1) importPath = '../components/ui/LoadingScreen';
    else if (nestedLevel === 2) importPath = '../../components/ui/LoadingScreen';
    else if (nestedLevel === 3) importPath = '../../../components/ui/LoadingScreen';
    else importPath = '../../components/ui/LoadingScreen';

    // Insert import at the top after React
    const importStatement = `import LoadingScreen from '${importPath}';\n`;
    
    // Find last import statement
    const lastImportMatched = [...content.matchAll(/^import\s+.*from\s+['"].*['"];?$/gm)];
    if (lastImportMatched.length > 0) {
      const lastImport = lastImportMatched[lastImportMatched.length - 1];
      const insertAt = lastImport.index + lastImport[0].length;
      content = content.slice(0, insertAt) + '\n' + importStatement + content.slice(insertAt);
    } else {
      content = importStatement + content;
    }
    
    fs.writeFileSync(file, content);
    console.log(`Updated ${path.relative(process.cwd(), file)}`);
    patchedCount++;
  }
}

console.log(`Patched ${patchedCount} files.`);
