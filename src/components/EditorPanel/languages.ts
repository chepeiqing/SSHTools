import { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'

interface LangDef {
  name: string
  extensions: string[]
  load: () => Promise<Extension>
}

const languages: LangDef[] = [
  { name: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], load: async () => (await import('@codemirror/lang-javascript')).javascript() },
  { name: 'TypeScript', extensions: ['.ts', '.mts', '.cts'], load: async () => (await import('@codemirror/lang-javascript')).javascript({ typescript: true }) },
  { name: 'JSX', extensions: ['.jsx'], load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }) },
  { name: 'TSX', extensions: ['.tsx'], load: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true }) },
  { name: 'Python', extensions: ['.py', '.pyw', '.pyi'], load: async () => (await import('@codemirror/lang-python')).python() },
  { name: 'JSON', extensions: ['.json', '.jsonc', '.json5'], load: async () => (await import('@codemirror/lang-json')).json() },
  { name: 'HTML', extensions: ['.html', '.htm', '.xhtml'], load: async () => (await import('@codemirror/lang-html')).html() },
  { name: 'CSS', extensions: ['.css'], load: async () => (await import('@codemirror/lang-css')).css() },
  { name: 'SCSS', extensions: ['.scss', '.sass', '.less'], load: async () => (await import('@codemirror/lang-css')).css() },
  { name: 'Markdown', extensions: ['.md', '.markdown', '.mdx'], load: async () => (await import('@codemirror/lang-markdown')).markdown() },
  { name: 'XML', extensions: ['.xml', '.svg', '.xsl', '.xslt', '.plist'], load: async () => (await import('@codemirror/lang-xml')).xml() },
  { name: 'SQL', extensions: ['.sql'], load: async () => (await import('@codemirror/lang-sql')).sql() },
  { name: 'YAML', extensions: ['.yml', '.yaml'], load: async () => (await import('@codemirror/lang-yaml')).yaml() },
  { name: 'Java', extensions: ['.java'], load: async () => (await import('@codemirror/lang-java')).java() },
  { name: 'C', extensions: ['.c', '.h'], load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  { name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'], load: async () => (await import('@codemirror/lang-cpp')).cpp() },
  { name: 'C#', extensions: ['.cs'], load: async () => (await import('@codemirror/lang-java')).java() },
  { name: 'PHP', extensions: ['.php'], load: async () => (await import('@codemirror/lang-php')).php() },
  { name: 'Rust', extensions: ['.rs'], load: async () => (await import('@codemirror/lang-rust')).rust() },
  { name: 'Go', extensions: ['.go'], load: async () => (await import('@codemirror/lang-go')).go() },
  { name: 'Shell', extensions: ['.sh', '.bash', '.zsh', '.fish', '.ksh'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell) },
  { name: 'Dockerfile', extensions: ['.dockerfile'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile) },
  { name: 'TOML', extensions: ['.toml'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/toml')).toml) },
  { name: 'INI', extensions: ['.ini', '.cfg', '.conf', '.properties'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties) },
  { name: 'Lua', extensions: ['.lua'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/lua')).lua) },
  { name: 'Ruby', extensions: ['.rb', '.rake', '.gemspec'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/ruby')).ruby) },
  { name: 'Perl', extensions: ['.pl', '.pm'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/perl')).perl) },
  { name: 'PowerShell', extensions: ['.ps1', '.psm1', '.psd1'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/powershell')).powerShell) },
  { name: 'Diff', extensions: ['.diff', '.patch'], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/diff')).diff) },
  { name: 'Log', extensions: ['.log'], load: async () => [] as unknown as Extension },
]

const specialFiles: Record<string, LangDef> = {
  Makefile: { name: 'Makefile', extensions: [], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell) },
  Dockerfile: { name: 'Dockerfile', extensions: [], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile) },
  '.gitignore': { name: 'Git Ignore', extensions: [], load: async () => [] as unknown as Extension },
  '.env': { name: 'Env', extensions: [], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties) },
  'nginx.conf': { name: 'Nginx', extensions: [], load: async () => StreamLanguage.define((await import('@codemirror/legacy-modes/mode/nginx')).nginx) },
}

function findLang(fileName: string): LangDef | undefined {
  const baseName = fileName.split('/').pop() || fileName
  if (specialFiles[baseName]) return specialFiles[baseName]

  const dotIdx = baseName.lastIndexOf('.')
  if (dotIdx === -1) return undefined
  const ext = baseName.slice(dotIdx).toLowerCase()
  return languages.find(l => l.extensions.includes(ext))
}

export async function getLanguageExtension(fileName: string): Promise<Extension> {
  const lang = findLang(fileName)
  if (!lang) return []
  try {
    return await lang.load()
  } catch {
    return []
  }
}

export function getLanguageName(fileName: string): string {
  return findLang(fileName)?.name || 'Text'
}

const binaryExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff', '.tif',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.wav', '.ogg', '.flac',
  '.zip', '.tar', '.gz', '.bz2', '.xz', '.7z', '.rar', '.zst',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.class', '.pyc', '.pyo',
  '.sqlite', '.db', '.dat',
])

export function isBinaryFile(fileName: string): boolean {
  const dotIdx = fileName.lastIndexOf('.')
  if (dotIdx === -1) return false
  const ext = fileName.slice(dotIdx).toLowerCase()
  return binaryExtensions.has(ext)
}
