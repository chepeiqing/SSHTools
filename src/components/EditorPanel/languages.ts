import { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { java } from '@codemirror/lang-java'
import { cpp } from '@codemirror/lang-cpp'
import { php } from '@codemirror/lang-php'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { diff } from '@codemirror/legacy-modes/mode/diff'

interface LangDef {
  name: string
  extensions: string[]
  load: () => Extension
}

const languages: LangDef[] = [
  { name: 'JavaScript', extensions: ['.js', '.mjs', '.cjs'], load: () => javascript() },
  { name: 'TypeScript', extensions: ['.ts', '.mts', '.cts'], load: () => javascript({ typescript: true }) },
  { name: 'JSX', extensions: ['.jsx'], load: () => javascript({ jsx: true }) },
  { name: 'TSX', extensions: ['.tsx'], load: () => javascript({ jsx: true, typescript: true }) },
  { name: 'Python', extensions: ['.py', '.pyw', '.pyi'], load: () => python() },
  { name: 'JSON', extensions: ['.json', '.jsonc', '.json5'], load: () => json() },
  { name: 'HTML', extensions: ['.html', '.htm', '.xhtml'], load: () => html() },
  { name: 'CSS', extensions: ['.css'], load: () => css() },
  { name: 'SCSS', extensions: ['.scss', '.sass', '.less'], load: () => css() },
  { name: 'Markdown', extensions: ['.md', '.markdown', '.mdx'], load: () => markdown() },
  { name: 'XML', extensions: ['.xml', '.svg', '.xsl', '.xslt', '.plist'], load: () => xml() },
  { name: 'SQL', extensions: ['.sql'], load: () => sql() },
  { name: 'YAML', extensions: ['.yml', '.yaml'], load: () => yaml() },
  { name: 'Java', extensions: ['.java'], load: () => java() },
  { name: 'C', extensions: ['.c', '.h'], load: () => cpp() },
  { name: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'], load: () => cpp() },
  { name: 'C#', extensions: ['.cs'], load: () => java() },
  { name: 'PHP', extensions: ['.php'], load: () => php() },
  { name: 'Rust', extensions: ['.rs'], load: () => rust() },
  { name: 'Go', extensions: ['.go'], load: () => go() },
  { name: 'Shell', extensions: ['.sh', '.bash', '.zsh', '.fish', '.ksh'], load: () => StreamLanguage.define(shell) },
  { name: 'Dockerfile', extensions: ['.dockerfile'], load: () => StreamLanguage.define(dockerFile) },
  { name: 'TOML', extensions: ['.toml'], load: () => StreamLanguage.define(toml) },
  { name: 'INI', extensions: ['.ini', '.cfg', '.conf', '.properties'], load: () => StreamLanguage.define(properties) },
  { name: 'Lua', extensions: ['.lua'], load: () => StreamLanguage.define(lua) },
  { name: 'Ruby', extensions: ['.rb', '.rake', '.gemspec'], load: () => StreamLanguage.define(ruby) },
  { name: 'Perl', extensions: ['.pl', '.pm'], load: () => StreamLanguage.define(perl) },
  { name: 'PowerShell', extensions: ['.ps1', '.psm1', '.psd1'], load: () => StreamLanguage.define(powerShell) },
  { name: 'Diff', extensions: ['.diff', '.patch'], load: () => StreamLanguage.define(diff) },
  { name: 'Log', extensions: ['.log'], load: () => [] as unknown as Extension },
]

// 特殊文件名匹配
const specialFiles: Record<string, LangDef> = {
  'Makefile': { name: 'Makefile', extensions: [], load: () => StreamLanguage.define(shell) },
  'Dockerfile': { name: 'Dockerfile', extensions: [], load: () => StreamLanguage.define(dockerFile) },
  '.gitignore': { name: 'Git Ignore', extensions: [], load: () => [] as unknown as Extension },
  '.env': { name: 'Env', extensions: [], load: () => StreamLanguage.define(properties) },
  'nginx.conf': { name: 'Nginx', extensions: [], load: () => StreamLanguage.define(nginx) },
}

function findLang(fileName: string): LangDef | undefined {
  // 先匹配特殊文件名
  const baseName = fileName.split('/').pop() || fileName
  if (specialFiles[baseName]) return specialFiles[baseName]

  // 再匹配扩展名
  const dotIdx = baseName.lastIndexOf('.')
  if (dotIdx === -1) return undefined
  const ext = baseName.slice(dotIdx).toLowerCase()
  return languages.find(l => l.extensions.includes(ext))
}

export function getLanguageExtension(fileName: string): Extension {
  const lang = findLang(fileName)
  if (!lang) return []
  try {
    return lang.load()
  } catch {
    return []
  }
}

export function getLanguageName(fileName: string): string {
  return findLang(fileName)?.name || 'Text'
}

// 判断是否为文本文件（通过扩展名）
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
