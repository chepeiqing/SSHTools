import './index.css'

const DocPanel: React.FC = () => {
  return (
    <div className="doc-panel">
      <div className="doc-container">
        <div className="doc-header">
          <h1 className="doc-main-title">SSHTools 使用文档</h1>
          <p className="doc-version">v{__APP_VERSION__}</p>
        </div>

        <nav className="doc-toc">
          <h3>目录</h3>
          <ul>
            <li><a href="#quick-start">快速开始</a></li>
            <li><a href="#server-manage">会话管理</a></li>
            <li><a href="#terminal">SSH 终端</a></li>
            <li><a href="#sftp">SFTP 文件管理</a></li>
            <li><a href="#editor">在线编辑器</a></li>
            <li><a href="#monitor">服务器监控</a></li>
            <li><a href="#quick-commands">快捷指令</a></li>
            <li><a href="#commands-lib">常用命令库</a></li>
            <li><a href="#theme">主题与个性化</a></li>
            <li><a href="#security">安全与备份</a></li>
            <li><a href="#shortcuts">快捷键一览</a></li>
          </ul>
        </nav>

        <section id="quick-start" className="doc-section">
          <h2>快速开始</h2>
          <ol className="doc-steps">
            <li><strong>新建会话</strong>：点击标签栏右侧 <code>+</code> 按钮，或首页"新建连接"模块，填写主机地址、端口、用户名和密码</li>
            <li><strong>连接服务器</strong>：双击左侧服务器卡片，或右键选择"连接"</li>
            <li><strong>管理分组</strong>：右键空白区域创建分组，将服务器拖拽到分组中</li>
            <li><strong>打开 SFTP</strong>：终端工具栏点击文件夹图标，从终端当前目录打开文件管理器</li>
            <li><strong>搜索服务器</strong>：使用标题栏搜索框，按名称、主机、用户名模糊匹配快速定位</li>
          </ol>
        </section>

        <section id="server-manage" className="doc-section">
          <h2>会话管理</h2>

          <h3>新建会话</h3>
          <p>支持两种认证方式：</p>
          <ul>
            <li><strong>密码认证</strong>：输入登录密码，可选择"记住密码"</li>
            <li><strong>密钥认证</strong>：选择本地密钥文件或直接粘贴密钥内容，支持密钥口令</li>
          </ul>
          <p>不记住密码时，每次连接会弹窗要求输入。认证失败时也会弹窗重试。</p>

          <h3>树形分组</h3>
          <ul>
            <li>支持多级嵌套子分组，右键分组可创建子分组</li>
            <li>服务器卡片显示名称、地址、描述、最后连接时间</li>
            <li>分组标题显示服务器计数</li>
          </ul>

          <h3>右键菜单</h3>
          <table className="doc-table">
            <thead><tr><th>操作</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>连接</td><td>快速连接服务器</td></tr>
              <tr><td>新建会话</td><td>在当前分组下创建新配置</td></tr>
              <tr><td>新建分组</td><td>创建子分组</td></tr>
              <tr><td>编辑</td><td>修改服务器配置</td></tr>
              <tr><td>复制</td><td>复制当前配置（自动添加"副本"后缀）</td></tr>
              <tr><td>删除</td><td>删除服务器（需确认）</td></tr>
              <tr><td>重命名分组</td><td>修改分组名称</td></tr>
              <tr><td>删除分组</td><td>删除分组，子项向上移动</td></tr>
            </tbody>
          </table>

          <h3>快速连接</h3>
          <p>侧边栏顶部"快速连接"区域显示最近连接的 4 个服务器，双击即可快速连接。</p>
        </section>

        <section id="terminal" className="doc-section">
          <h2>SSH 终端</h2>
          <p>基于 xterm.js 的完整终端模拟器，支持 256 色、Unicode 和链接点击。</p>

          <h3>工具栏功能</h3>
          <table className="doc-table">
            <thead><tr><th>按钮</th><th>功能</th></tr></thead>
            <tbody>
              <tr><td>换行 / 不换行</td><td>切换自动换行，不换行时启用水平滚动</td></tr>
              <tr><td>滚动到底部</td><td>跳转到终端最新输出</td></tr>
              <tr><td>清屏</td><td>清除终端内容</td></tr>
              <tr><td>搜索</td><td>打开搜索栏，支持上一个/下一个导航</td></tr>
              <tr><td>复制</td><td>复制选中的终端内容</td></tr>
              <tr><td>导出日志</td><td>将终端完整输出导出为 .txt 文件</td></tr>
              <tr><td>历史命令</td><td>从远程 shell 获取命令历史，点击重新执行</td></tr>
              <tr><td>快捷命令 ⚡</td><td>管理和使用该服务器的自定义快捷命令</td></tr>
              <tr><td>SFTP</td><td>打开 SFTP 面板，自动定位到终端当前目录</td></tr>
              <tr><td>设置</td><td>配置字号、配色方案、换行、滚动等选项</td></tr>
            </tbody>
          </table>

          <h3>右键菜单</h3>
          <p>终端区域右键可快速访问复制、粘贴、复制并粘贴、全选、清屏、搜索、导出日志、打开 SFTP 和重新连接等功能。</p>

          <h3>终端设置</h3>
          <ul>
            <li><strong>字体大小</strong>：8px - 32px，快捷键 Ctrl+/-/0 快速调整</li>
            <li><strong>配色方案</strong>：内置多种深色和浅色预设，支持自定义前景色、背景色、光标色</li>
            <li><strong>自动换行</strong>：开关，关闭后终端宽度为 500 列</li>
            <li><strong>输出自动滚动</strong>：开关，关闭后查看日志时不会自动跳到底部</li>
          </ul>

          <h3>连接管理</h3>
          <ul>
            <li>连接断开后终端提示"按 Enter 重新连接"</li>
            <li>工具栏显示连接状态（用户名/已断开），提供重连按钮</li>
            <li>标签页右键菜单提供断开、重连、复制会话等操作</li>
          </ul>
        </section>

        <section id="sftp" className="doc-section">
          <h2>SFTP 文件管理</h2>
          <p>集成在终端下方，可拖拽分割线调整面板高度。</p>

          <h3>文件浏览</h3>
          <ul>
            <li>双击目录进入，双击文本文件在编辑器中打开</li>
            <li>路径栏支持手动输入路径并回车导航</li>
            <li>支持显示/隐藏以 <code>.</code> 开头的隐藏文件</li>
            <li>列表支持按名称、类型、大小、修改时间排序</li>
            <li>列宽可拖拽调整</li>
            <li>键入字母可快速定位文件（1.5 秒后自动清除）</li>
          </ul>

          <h3>文件操作</h3>
          <table className="doc-table">
            <thead><tr><th>操作</th><th>说明</th></tr></thead>
            <tbody>
              <tr><td>上传</td><td>选择本地文件上传，支持拖拽多文件上传</td></tr>
              <tr><td>下载</td><td>单文件选择保存位置，多文件选择保存目录</td></tr>
              <tr><td>新建文件夹</td><td>在当前目录创建空目录</td></tr>
              <tr><td>新建文件</td><td>在当前目录创建空文件</td></tr>
              <tr><td>重命名</td><td>重命名文件或目录，目标已存在时确认覆盖</td></tr>
              <tr><td>删除</td><td>删除文件或递归删除目录（需确认）</td></tr>
              <tr><td>修改权限</td><td>输入八进制权限值（如 755、644）</td></tr>
              <tr><td>复制路径</td><td>复制文件的远程绝对路径</td></tr>
            </tbody>
          </table>

          <h3>传输队列</h3>
          <p>点击工具栏传输按钮可展开传输队列，查看上传/下载任务状态。支持取消待处理任务、重试失败任务。上传完成后自动刷新当前目录。</p>
        </section>

        <section id="editor" className="doc-section">
          <h2>在线编辑器</h2>
          <p>双击 SFTP 中的文本文件即可在新标签页中打开远程编辑器。</p>
          <ul>
            <li>基于 CodeMirror，支持多语言语法高亮</li>
            <li>显示文件路径、语言类型、文件大小</li>
            <li>未保存时标签页显示橙色标记，关闭时会提示确认</li>
            <li>支持切换文件编码：UTF-8、UTF-8 BOM、UTF-16 LE/BE、Latin-1</li>
            <li>Ctrl+S 快速保存到远程服务器</li>
          </ul>
        </section>

        <section id="monitor" className="doc-section">
          <h2>服务器监控</h2>
          <p>终端标签页右侧的详情面板实时展示服务器运行状态，每 5 秒自动刷新。面板宽度可拖拽调整。</p>

          <h3>资源概览</h3>
          <p>三个环形进度图分别显示 CPU、内存、磁盘使用率。颜色随使用率变化：绿色（正常）→ 黄色（较高）→ 红色（超过 80%）。</p>

          <h3>服务器信息</h3>
          <p>显示操作系统、主机名、公网地址、内网 IP、登录用户。带复制图标的字段点击即可复制。</p>

          <h3>运行概况</h3>
          <p>显示系统运行时间、当前进程数、在线登录用户数。</p>

          <h3>TOP 进程</h3>
          <p>列出 CPU 占用最高的 5 个进程，鼠标悬停显示完整命令行和进程详情。</p>
        </section>

        <section id="quick-commands" className="doc-section">
          <h2>快捷指令</h2>
          <p>每个服务器可独立配置一组快捷指令，连接后在终端工具栏点击 ⚡ 图标管理。</p>
          <ol className="doc-steps">
            <li>点击 <code>+</code> 添加命令，填写名称和命令内容</li>
            <li>点击命令即可输入到终端（不自动回车，由你决定是否执行）</li>
            <li>支持编辑和删除已有命令</li>
          </ol>
          <p>快捷指令按服务器独立存储，跟随服务器配置持久化。</p>
        </section>

        <section id="commands-lib" className="doc-section">
          <h2>常用命令库</h2>
          <p>首页"常用命令"模块提供运维常用 Linux 命令速查，涵盖 15 个分类：</p>
          <div className="doc-tags">
            {['系统信息', 'CPU 监控', '内存监控', '磁盘存储', '网络监控', '进程管理', '日志查看', '用户管理', '服务管理', '文件操作', 'Docker', 'Nginx', 'MySQL', 'Redis', '安全检查'].map(tag => (
              <span key={tag} className="doc-tag">{tag}</span>
            ))}
          </div>
          <p>支持搜索过滤，点击命令卡片即可复制到剪贴板。危险操作命令会有红色标记警示。</p>
        </section>

        <section id="theme" className="doc-section">
          <h2>主题与个性化</h2>
          <ul>
            <li><strong>全局主题</strong>：标题栏设置菜单切换 浅色 / 深色 / 跟随系统</li>
            <li><strong>终端配色</strong>：终端设置面板内切换预设配色方案，或自定义前景色/背景色/光标色</li>
            <li><strong>侧边栏</strong>：可折叠/展开，宽度可拖拽调整</li>
            <li><strong>详情面板</strong>：宽度可拖拽调整（240px - 500px）</li>
            <li><strong>SFTP 面板</strong>：高度可拖拽调整</li>
          </ul>
        </section>

        <section id="security" className="doc-section">
          <h2>安全与备份</h2>
          <h3>凭据安全</h3>
          <ul>
            <li>密码和私钥通过 Electron safeStorage 加密存储（Windows DPAPI / macOS Keychain）</li>
            <li>localStorage 中不保存任何明文密码</li>
          </ul>

          <h3>配置导入导出</h3>
          <ul>
            <li>标题栏设置菜单 → 导出配置，设置加密密码后导出 JSON 文件</li>
            <li>导入时输入相同密码即可还原所有服务器和分组配置</li>
            <li>使用 PBKDF2 + AES-256-GCM 加密敏感字段</li>
          </ul>

          <h3>自动备份</h3>
          <p>服务器配置自动备份到 electron-store，localStorage 数据丢失时自动恢复。</p>
        </section>

        <section id="shortcuts" className="doc-section">
          <h2>快捷键一览</h2>
          <table className="doc-table">
            <thead><tr><th>快捷键</th><th>作用域</th><th>功能</th></tr></thead>
            <tbody>
              <tr><td><kbd>Ctrl+F</kbd></td><td>终端 / 编辑器</td><td>打开搜索</td></tr>
              <tr><td><kbd>Ctrl+S</kbd></td><td>编辑器</td><td>保存文件</td></tr>
              <tr><td><kbd>Ctrl+Shift+C</kbd></td><td>终端</td><td>复制选中内容</td></tr>
              <tr><td><kbd>Ctrl+Shift+V</kbd></td><td>终端</td><td>粘贴</td></tr>
              <tr><td><kbd>Ctrl+=</kbd> / <kbd>Ctrl++</kbd></td><td>终端</td><td>放大字体</td></tr>
              <tr><td><kbd>Ctrl+-</kbd></td><td>终端</td><td>缩小字体</td></tr>
              <tr><td><kbd>Ctrl+0</kbd></td><td>终端</td><td>重置字体大小</td></tr>
              <tr><td><kbd>Ctrl+R</kbd></td><td>终端</td><td>已禁用（防止页面刷新）</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>全局</td><td>关闭搜索 / 取消操作</td></tr>
            </tbody>
          </table>
          <p className="doc-note">macOS 上将 Ctrl 替换为 Cmd。</p>
        </section>

        <div className="doc-footer">
          <p>SSHTools — 开源跨平台 SSH 管理工具</p>
          <p>如有问题或建议，欢迎在 GitHub 提交 Issue</p>
        </div>
      </div>
    </div>
  )
}

export default DocPanel
