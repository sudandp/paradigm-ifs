import os
import re

pages_dir = os.path.join(os.getcwd(), 'pages')

for root, dirs, files in os.walk(pages_dir):
    for file in files:
        if file.endswith('.tsx') and file != 'LeaveDashboard.tsx':
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Check if there is isLoading and it's a React component
            if 'isLoading' in content or 'isDataLoading' in content:
                original = content
                
                # Check what variable is used
                match = re.search(r'const \[(.*?Loading[A-Za-z0-9_]*?)\]', content)
                if not match:
                    if 'isLoading' in content:
                        var_name = 'isLoading'
                    else:
                        continue
                else:
                    var_name = match.group(1).strip()
                
                # We want to replace the FIRST return statement that we see after we define the component, OR just replace existing if(isLoading) returns.
                # Let's replace: if (isLoading) return <anything>;
                # Or: if (isLoading) { return <anything>; }
                
                # First, if there's already an if(isLoading) return ... block:
                # Remove it or replace it.
                pattern1 = r'if\s*\(\s*' + var_name + r'\s*\)\s*return\s*<[A-Za-z0-9_ \'"=]+>.*?</[A-Za-z0-9_]+>;'
                content = re.sub(pattern1, '', content, flags=re.DOTALL)
                
                pattern2 = r'if\s*\(\s*' + var_name + r'\s*\)\s*\{\s*return\s*<[A-Za-z0-9_ \'"=]+>.*?</[A-Za-z0-9_]+>;\s*\}'
                content = re.sub(pattern2, '', content, flags=re.DOTALL)
                
                # Skeletons might be returned differently, e.g. if (isLoading && something) ...
                
                # The most foolproof way: Right before the FINAL return of the component, insert our if (isLoading) return LoadingScreen
                # Components usually end with:
                # return (
                #    <div className="...">
                #       ...
                #    </div>
                # );
                # }
                
                # Find the main return statement of the component.
                # It's usually `return (` or `return <div` at the indentation level of 4 spaces from `return`
                
                if 'LoadingScreen' not in content:
                    # Let's just find the last `return (` that is roughly at the component level.
                    # Actually, if we just find `const [isLoading` ... and then the nearest `return (` after it:
                    
                    # Split into lines to do safer injection
                    lines = content.split('\n')
                    inserted = False
                    for i, line in enumerate(lines):
                        if line.strip().startswith('return (') or line.strip().startswith('return <div'):
                            # Insert here! Check if it's the main component return (it's typically between lines 30 and 200, not line 500 inside a map)
                            # Let's look for the first `return (` after `useState` or `useEffect`
                            # Actually, just looking at the indentation helps. `    return (` or `  return (`
                            if line.startswith('    return') or line.startswith('  return'):
                                spaces = line[:len(line) - len(line.lstrip())]
                                injection = spaces + 'if (' + var_name + ') {\n' + spaces + '    return <LoadingScreen message="Loading page data..." />;\n' + spaces + '}\n'
                                lines.insert(i, injection)
                                inserted = True
                                break
                    
                    if inserted:
                        content = '\n'.join(lines)
                        
                        # Add import
                        # Calculate relative path to components/ui/LoadingScreen
                        rel_path = os.path.relpath(filepath, pages_dir)
                        depth = len(rel_path.split(os.sep)) - 1
                        if depth == 0:
                            import_path = '../components/ui/LoadingScreen'
                        elif depth == 1:
                            import_path = '../../components/ui/LoadingScreen'
                        elif depth == 2:
                            import_path = '../../../components/ui/LoadingScreen'
                        else:
                            import_path = '../../components/ui/LoadingScreen'
                            
                        import_stmt = f"import LoadingScreen from '{import_path}';\n"
                        
                        # Find last import
                        import_idx = 0
                        for i, line in enumerate(lines):
                            if line.startswith('import '):
                                import_idx = i
                        
                        lines = content.split('\n')
                        lines.insert(import_idx + 1, import_stmt)
                        content = '\n'.join(lines)
                        
                        with open(filepath, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print("Patched " + file)

