import { useState, useMemo } from 'react'
import { Input, Tag, Collapse, Empty, App } from 'antd'
import {
  SearchOutlined,
  CopyFilled,
  CheckCircleFilled,
  CodeOutlined,
} from '@ant-design/icons'
import type { CollapseProps } from 'antd'
import Tooltip from '../DelayedTooltip'
import './index.css'

// 命令分类
interface CommandItem {
  name: string
  command: string
  description?: string
  danger?: boolean
}

interface CommandCategory {
  key: string
  label: string
  commands: CommandItem[]
}

// 常用运维命令库
const COMMANDS_LIBRARY: CommandCategory[] = [
  {
    key: 'system',
    label: '系统信息',
    commands: [
      { name: '系统版本', command: 'cat /etc/os-release', description: '查看操作系统版本' },
      { name: '内核版本', command: 'uname -r', description: '查看内核版本' },
      { name: '系统运行时间', command: 'uptime', description: '查看系统运行时间和负载' },
      { name: '主机名', command: 'hostname', description: '查看主机名' },
      { name: 'CPU信息', command: 'lscpu', description: '查看 CPU 详细信息' },
      { name: 'CPU核数', command: 'nproc', description: '查看 CPU 核心数' },
      { name: '系统架构', command: 'uname -m', description: '查看系统架构' },
      { name: '环境变量', command: 'env | grep -i xxx', description: '查看环境变量（替换xxx）' },
    ],
  },
  {
    key: 'cpu',
    label: 'CPU 监控',
    commands: [
      { name: '实时CPU', command: 'top -bn1 | head -20', description: '查看 CPU 使用情况' },
      { name: 'CPU使用率', command: "top -bn1 | grep 'Cpu(s)' | awk '{print $2+$4}'", description: '获取 CPU 使用百分比' },
      { name: '每核详情', command: 'mpstat -P ALL 1 1', description: '查看每个核心使用情况' },
      { name: '高CPU进程', command: 'ps aux --sort=-%cpu | head -10', description: '查看 CPU 占用最高的进程' },
      { name: '负载均衡', command: 'cat /proc/loadavg', description: '查看系统负载' },
    ],
  },
  {
    key: 'memory',
    label: '内存监控',
    commands: [
      { name: '内存概况', command: 'free -h', description: '查看内存使用情况' },
      { name: '内存详情', command: 'cat /proc/meminfo', description: '查看详细内存信息' },
      { name: 'Swap使用', command: 'swapon -s', description: '查看交换分区使用情况' },
      { name: '高内存进程', command: 'ps aux --sort=-%mem | head -10', description: '查看内存占用最高的进程' },
      { name: '进程内存排序', command: 'top -o %MEM', description: '按内存排序显示进程' },
    ],
  },
  {
    key: 'disk',
    label: '磁盘存储',
    commands: [
      { name: '磁盘使用', command: 'df -h', description: '查看磁盘使用情况' },
      { name: 'Inode使用', command: 'df -i', description: '查看 inode 使用情况' },
      { name: '目录大小', command: 'du -sh * | sort -h', description: '查看当前目录各文件大小' },
      { name: '磁盘IO', command: 'iostat -x 1 3', description: '查看磁盘 IO 状态' },
      { name: '大文件查找', command: 'find / -type f -size +100M 2>/dev/null | head -20', description: '查找大于100M的文件' },
      { name: '挂载信息', command: 'mount | column -t', description: '查看挂载信息' },
      { name: '磁盘分区', command: 'fdisk -l', description: '查看磁盘分区', danger: true },
    ],
  },
  {
    key: 'network',
    label: '网络监控',
    commands: [
      { name: '网卡信息', command: 'ip addr', description: '查看网卡配置' },
      { name: '监听端口', command: 'ss -tlnp', description: '查看监听的 TCP 端口' },
      { name: '连接状态', command: 'ss -tan | awk \'{print $1}\' | sort | uniq -c', description: '统计连接状态' },
      { name: '网络流量', command: 'iftop -n', description: '实时网络流量' },
      { name: '路由表', command: 'ip route', description: '查看路由表' },
      { name: 'DNS解析', command: 'dig google.com', description: 'DNS 解析测试' },
      { name: '网络连通', command: 'ping -c 4 8.8.8.8', description: '测试网络连通性' },
      { name: '端口连通', command: 'nc -zv host port', description: '测试端口连通性' },
      { name: '防火墙状态', command: 'firewall-cmd --list-all', description: '查看防火墙规则' },
      { name: 'iptables', command: 'iptables -L -n', description: '查看 iptables 规则' },
    ],
  },
  {
    key: 'process',
    label: '进程管理',
    commands: [
      { name: '进程列表', command: 'ps aux', description: '查看所有进程' },
      { name: '进程树', command: 'pstree -p', description: '查看进程树' },
      { name: '实时进程', command: 'top', description: '实时进程监控' },
      { name: '查找进程', command: 'ps aux | grep xxx', description: '按名称查找进程' },
      { name: '进程详情', command: 'cat /proc/<pid>/status', description: '查看进程详细信息' },
      { name: '打开文件', command: 'lsof -p <pid>', description: '查看进程打开的文件' },
      { name: '结束进程', command: 'kill -9 <pid>', description: '强制结束进程', danger: true },
      { name: '批量结束', command: 'pkill -f xxx', description: '按名称批量结束进程', danger: true },
    ],
  },
  {
    key: 'log',
    label: '日志查看',
    commands: [
      { name: '系统日志', command: 'tail -100 /var/log/messages', description: '查看系统日志' },
      { name: '安全日志', command: 'tail -100 /var/log/secure', description: '查看安全日志' },
      { name: '内核日志', command: 'dmesg | tail -50', description: '查看内核日志' },
      { name: '系统启动日志', command: 'journalctl -b', description: '查看本次启动日志' },
      { name: '服务日志', command: 'journalctl -u xxx -f', description: '实时查看服务日志' },
      { name: '错误日志', command: 'journalctl -p err', description: '查看错误级别日志' },
      { name: '登录历史', command: 'last', description: '查看登录历史' },
      { name: '失败登录', command: 'lastb', description: '查看失败登录记录' },
    ],
  },
  {
    key: 'user',
    label: '用户管理',
    commands: [
      { name: '在线用户', command: 'w', description: '查看当前在线用户' },
      { name: '用户列表', command: 'cat /etc/passwd', description: '查看所有用户' },
      { name: '组列表', command: 'cat /etc/group', description: '查看所有组' },
      { name: 'sudo配置', command: 'cat /etc/sudoers', description: '查看 sudo 配置', danger: true },
      { name: '用户crontab', command: 'crontab -l', description: '查看当前用户的定时任务' },
      { name: '系统crontab', command: 'cat /etc/crontab', description: '查看系统定时任务' },
    ],
  },
  {
    key: 'service',
    label: '服务管理',
    commands: [
      { name: '服务列表', command: 'systemctl list-units --type=service', description: '查看所有服务' },
      { name: '服务状态', command: 'systemctl status xxx', description: '查看服务状态' },
      { name: '启动服务', command: 'systemctl start xxx', description: '启动服务', danger: true },
      { name: '停止服务', command: 'systemctl stop xxx', description: '停止服务', danger: true },
      { name: '重启服务', command: 'systemctl restart xxx', description: '重启服务', danger: true },
      { name: '开机自启', command: 'systemctl enable xxx', description: '设置开机自启' },
      { name: '禁止自启', command: 'systemctl disable xxx', description: '禁止开机自启' },
      { name: '服务日志', command: 'journalctl -u xxx -n 100', description: '查看服务日志' },
    ],
  },
  {
    key: 'file',
    label: '文件操作',
    commands: [
      { name: '查找文件', command: 'find / -name "*.log" 2>/dev/null', description: '按名称查找文件' },
      { name: '最近修改', command: 'find . -mtime -1 -type f', description: '查找最近修改的文件' },
      { name: '文件内容', command: 'grep -r "xxx" /path', description: '在文件中搜索内容' },
      { name: '文件权限', command: 'ls -la', description: '查看文件权限' },
      { name: '修改权限', command: 'chmod 755 xxx', description: '修改文件权限', danger: true },
      { name: '修改所有者', command: 'chown user:group xxx', description: '修改文件所有者', danger: true },
      { name: '创建目录', command: 'mkdir -p /path/to/dir', description: '创建目录' },
      { name: '压缩文件', command: 'tar -czvf archive.tar.gz /path', description: '压缩目录' },
      { name: '解压文件', command: 'tar -xzvf archive.tar.gz', description: '解压文件' },
      { name: '软链接', command: 'ln -s /source /target', description: '创建软链接' },
    ],
  },
  {
    key: 'docker',
    label: 'Docker',
    commands: [
      { name: '容器列表', command: 'docker ps -a', description: '查看所有容器' },
      { name: '镜像列表', command: 'docker images', description: '查看所有镜像' },
      { name: '容器日志', command: 'docker logs -f --tail 100 xxx', description: '查看容器日志' },
      { name: '进入容器', command: 'docker exec -it xxx /bin/bash', description: '进入容器终端' },
      { name: '容器资源', command: 'docker stats', description: '查看容器资源使用' },
      { name: '启动容器', command: 'docker start xxx', description: '启动容器' },
      { name: '停止容器', command: 'docker stop xxx', description: '停止容器' },
      { name: '重启容器', command: 'docker restart xxx', description: '重启容器' },
      { name: '删除容器', command: 'docker rm -f xxx', description: '强制删除容器', danger: true },
      { name: '删除镜像', command: 'docker rmi xxx', description: '删除镜像', danger: true },
      { name: '清理无用', command: 'docker system prune -af', description: '清理无用镜像和容器', danger: true },
      { name: 'docker-compose日志', command: 'docker-compose logs -f --tail 100', description: '查看 compose 日志' },
    ],
  },
  {
    key: 'nginx',
    label: 'Nginx',
    commands: [
      { name: '测试配置', command: 'nginx -t', description: '测试 Nginx 配置' },
      { name: '重载配置', command: 'nginx -s reload', description: '重载 Nginx 配置' },
      { name: 'Nginx状态', command: 'systemctl status nginx', description: '查看 Nginx 状态' },
      { name: '访问日志', command: 'tail -f /var/log/nginx/access.log', description: '实时查看访问日志' },
      { name: '错误日志', command: 'tail -f /var/log/nginx/error.log', description: '实时查看错误日志' },
      { name: '连接数', command: 'netstat -an | grep :80 | wc -l', description: '查看 80 端口连接数' },
    ],
  },
  {
    key: 'mysql',
    label: 'MySQL',
    commands: [
      { name: 'MySQL状态', command: 'systemctl status mysqld', description: '查看 MySQL 状态' },
      { name: 'MySQL连接', command: "mysql -u root -p -e 'show processlist;'", description: '查看连接数' },
      { name: '慢查询日志', command: 'tail -100 /var/log/mysql/slow.log', description: '查看慢查询日志' },
      { name: 'MySQL错误日志', command: 'tail -100 /var/log/mysql/error.log', description: '查看错误日志' },
      { name: '数据库大小', command: "mysql -e \"SELECT table_schema, ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)' FROM information_schema.tables GROUP BY table_schema;\"", description: '查看数据库大小' },
    ],
  },
  {
    key: 'redis',
    label: 'Redis',
    commands: [
      { name: 'Redis状态', command: 'systemctl status redis', description: '查看 Redis 状态' },
      { name: 'Redis信息', command: 'redis-cli info', description: '查看 Redis 详细信息' },
      { name: '内存使用', command: 'redis-cli info memory', description: '查看内存使用情况' },
      { name: '连接数', command: 'redis-cli info clients', description: '查看客户端连接数' },
      { name: '键数量', command: 'redis-cli DBSIZE', description: '查看键的数量' },
      { name: '实时监控', command: 'redis-cli monitor', description: '实时监控 Redis 命令' },
    ],
  },
  {
    key: 'security',
    label: '安全检查',
    commands: [
      { name: '开放端口', command: 'nmap localhost', description: '扫描本地开放端口' },
      { name: 'SSH配置', command: 'cat /etc/ssh/sshd_config', description: '查看 SSH 配置' },
      { name: '登录失败', command: 'grep "Failed password" /var/log/secure | tail -20', description: '查看登录失败记录' },
      { name: '可疑文件', command: 'find /tmp -type f -perm -111 2>/dev/null', description: '查找 tmp 下可执行文件' },
      { name: 'SUID文件', command: 'find / -perm -4000 2>/dev/null', description: '查找 SUID 文件' },
      { name: '最近登录', command: 'last -n 20', description: '查看最近登录记录' },
    ],
  },
]

const CommandsPanel: React.FC = () => {
  const { message } = App.useApp()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // 过滤命令
  const filteredCommands = useMemo(() => {
    if (!searchKeyword.trim()) {
      return COMMANDS_LIBRARY
    }
    
    const keyword = searchKeyword.toLowerCase()
    return COMMANDS_LIBRARY.map(category => ({
      ...category,
      commands: category.commands.filter(
        cmd => 
          cmd.name.toLowerCase().includes(keyword) ||
          cmd.command.toLowerCase().includes(keyword) ||
          (cmd.description && cmd.description.toLowerCase().includes(keyword))
      ),
    })).filter(category => category.commands.length > 0)
  }, [searchKeyword])

  // 复制命令
  const copyCommand = async (cmd: string, key: string) => {
    try {
      await navigator.clipboard.writeText(cmd)
      setCopiedKey(key)
      message.success('已复制到剪贴板')
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      message.error('复制失败')
    }
  }

  // 构建折叠面板
  const collapseItems: CollapseProps['items'] = filteredCommands.map(category => ({
    key: category.key,
    label: (
      <div className="command-category-header">
        <span className="category-label">{category.label}</span>
        <Tag color="blue">{category.commands.length}</Tag>
      </div>
    ),
    children: (
      <div className="command-list">
        {category.commands.map((cmd, idx) => (
          <div
            key={`${category.key}-${idx}`}
            className={`command-item ${cmd.danger ? 'danger' : ''}`}
          >
            <div className="command-info">
              <div className="command-name">
                {cmd.name}
                {cmd.danger && <Tag color="red" className="danger-tag">危险</Tag>}
              </div>
              {cmd.description && (
                <div className="command-desc">{cmd.description}</div>
              )}
            </div>
            <div className="command-actions">
              <Tooltip title={copiedKey === `${category.key}-${idx}` ? '已复制' : '复制命令'}>
                <div
                  className="command-text"
                  onClick={() => copyCommand(cmd.command, `${category.key}-${idx}`)}
                >
                  <code>{cmd.command}</code>
                  {copiedKey === `${category.key}-${idx}` ? (
                    <CheckCircleFilled className="copy-icon copied" />
                  ) : (
                    <CopyFilled className="copy-icon" />
                  )}
                </div>
              </Tooltip>
            </div>
          </div>
        ))}
      </div>
    ),
  }))

  return (
    <div className="commands-panel">
      <div className="commands-header">
        <div className="commands-title">
          <CodeOutlined />
          <h2>常用命令</h2>
        </div>
        <p className="commands-subtitle">运维人员常用 Linux 命令速查，点击命令即可复制</p>
      </div>

      <div className="commands-search">
        <Input
          placeholder="搜索命令名称、命令内容或描述..."
          prefix={<SearchOutlined />}
          allowClear
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
          className="commands-search-input"
        />
      </div>

      <div className="commands-content">
        {filteredCommands.length === 0 ? (
          <Empty description="未找到匹配的命令" />
        ) : (
          <Collapse
            defaultActiveKey={filteredCommands.slice(0, 3).map(c => c.key)}
            ghost
            items={collapseItems}
            className="commands-collapse"
          />
        )}
      </div>

      <div className="commands-footer">
        <span>共 {COMMANDS_LIBRARY.reduce((acc, c) => acc + c.commands.length, 0)} 条命令</span>
      </div>
    </div>
  )
}

export default CommandsPanel
