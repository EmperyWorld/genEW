import { analyzeExportsBatch, extractExports } from '../exportAnalyzer';

describe('exportAnalyzer', () => {
  it('extracts named function export', () => {
    const content = 'export function ProductList() { return null; }';
    expect(extractExports(content, 'src/ProductList.tsx')).toContain('ProductList');
  });

  it('extracts default export identifier', () => {
    const content = 'const App = () => null;\nexport default App;';
    const exports = extractExports(content, 'src/App.tsx');
    expect(exports).toContain('default');
    expect(exports).toContain('App');
  });

  it('extracts re-export specifiers', () => {
    const content = 'export { Foo, Bar as Baz } from "./module";';
    const exports = extractExports(content, 'src/index.ts');
    expect(exports).toContain('Foo');
    expect(exports).toContain('Baz');
  });

  it('extracts exported const declarations', () => {
    const content = 'export const API_URL = "http://localhost";';
    expect(extractExports(content, 'src/config.ts')).toContain('API_URL');
  });

  it('analyzes batch entries by path', () => {
    const result = analyzeExportsBatch([
      {
        path: 'src/A.tsx',
        content: 'export function A() {}',
      },
      {
        path: 'src/B.tsx',
        content: 'export class B {}',
      },
    ]);

    expect(result['src/A.tsx']).toContain('A');
    expect(result['src/B.tsx']).toContain('B');
  });
});
