import { Modal, Form, Input, InputNumber, TreeSelect, Button, App, Checkbox } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { FolderOpenOutlined, CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useServerStore, type ServerConfig } from '../../stores/serverStore'
import './NewSessionModal.css'

type SessionFormValues = Omit<ServerConfig, 'id' | 'lastConnectedAt' | 'tags'> & {
  privateKeyPath?: string
}

interface NewSessionModalProps {
  visible: boolean
  onClose: () => void
  onOk: (values: SessionFormValues) => void
  editData?: (ServerConfig & { privateKeyPath?: string }) | null
  defaultGroupId?: string
  initialData?: (Partial<ServerConfig> & { privateKeyPath?: string }) | null
}

const NewSessionModal: React.FC<NewSessionModalProps> = ({
  visible,
  onClose,
  onOk,
  editData,
  defaultGroupId,
  initialData,
}) => {
  const [form] = Form.useForm()
  const authType = Form.useWatch('authType', form)
  const { groups } = useServerStore()
  const { message } = App.useApp()
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [keyFilePath, setKeyFilePath] = useState<string>('')

  const groupTreeData = useMemo(() => {
    const buildChildren = (parentId?: string): { value: string; title: string; children?: { value: string; title: string }[] }[] => {
      return groups
        .filter(g => (g.parentId || undefined) === parentId)
        .sort((a, b) => a.order - b.order)
        .map(g => {
          const children = buildChildren(g.id)
          return {
            value: g.id,
            title: g.name,
            children: children.length > 0 ? children : undefined,
          }
        })
    }
    return buildChildren(undefined)
  }, [groups])

  useEffect(() => {
    if (visible) {
      setTestStatus('idle')
      if (editData) {
        form.setFieldsValue(editData)
        setKeyFilePath(editData.privateKeyPath || '')
      } else if (initialData) {
        // 复制模式：以新建模式打开，但回显已有数据
        form.resetFields()
        form.setFieldsValue(initialData)
        setKeyFilePath(initialData.privateKeyPath || '')
      } else {
        form.resetFields()
        setKeyFilePath('')
        form.setFieldsValue({
          port: 22,
          authType: 'password',
          rememberPassword: false,
          groupId: defaultGroupId || undefined,
        })
      }
    }
  }, [visible, editData, initialData, defaultGroupId, form])

  const handleOk = () => {
    form.validateFields().then((values) => {
      if (values.authType === 'privateKey' && keyFilePath) {
        values.privateKeyPath = keyFilePath
      }
      // 没填密码就不记住
      const hasCredential = values.authType === 'password'
        ? !!values.password
        : !!values.privateKey
      if (!hasCredential) {
        values.rememberPassword = false
      }
      if (!values.rememberPassword) {
        values.rememberPassword = false
      }
      onOk(values)
      form.resetFields()
    })
  }

  const handleSelectKeyFile = async () => {
    const result = await window.electronAPI.dialogOpenFile()
    if (!result.canceled && result.filePaths?.length > 0) {
      const filePath = result.filePaths[0]
      setKeyFilePath(filePath)
      const readResult = await window.electronAPI.readFile(filePath)
      if (readResult.success && readResult.content) {
        form.setFieldValue('privateKey', readResult.content)
      } else {
        message.error('无法读取密钥文件')
      }
    }
  }

  const handleTestConnection = async () => {
    try {
      const values = await form.validateFields(['host', 'port', 'username', 'authType', 'password', 'privateKey', 'passphrase'])
      setTestStatus('testing')

      const testId = `test-${Date.now()}`
      const result = await window.electronAPI.sshConnect({
        id: testId,
        host: values.host,
        port: values.port,
        username: values.username,
        password: values.authType === 'password' ? values.password : undefined,
        privateKey: values.authType === 'privateKey' ? values.privateKey : undefined,
        passphrase: values.authType === 'privateKey' ? values.passphrase : undefined,
      })

      if (result.success) {
        setTestStatus('success')
        message.success('连接测试成功')
        await window.electronAPI.sshDisconnect(testId)
      } else {
        setTestStatus('error')
        message.error('连接失败: ' + result.error)
      }
    } catch {
      setTestStatus('error')
      message.error('请先填写连接信息')
    }
  }

  const testBtnIcon = testStatus === 'testing' ? <LoadingOutlined /> :
                      testStatus === 'success' ? <CheckCircleOutlined /> :
                      testStatus === 'error' ? <CloseCircleOutlined /> : undefined

  const testBtnClass = 'nsm-test-btn ' + (testStatus === 'success' ? 'success' : testStatus === 'error' ? 'error' : '')

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
      className="new-session-modal"
      closable
      centered
    >
      <div className="nsm-container">
        <div className="nsm-header">
          <h2 className="nsm-title">{editData ? '编辑会话' : '新建会话'}</h2>
        </div>

        <div className="nsm-body">
          <Form form={form} layout="vertical" name="sessionForm">
            <Form.Item
              name="name"
              label="会话名称"
              rules={[{ required: true, message: '请输入会话名称' }]}
            >
              <Input placeholder="例如：生产服务器" />
            </Form.Item>

            <div className="nsm-row">
              <Form.Item
                name="host"
                label="主机地址"
                rules={[{ required: true, message: '请输入主机地址' }]}
              >
                <Input placeholder="192.168.1.100 或 example.com" />
              </Form.Item>
              <Form.Item
                name="port"
                label="端口"
                rules={[{ required: true, message: '端口' }]}
                style={{ width: '100px' }}
              >
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <Form.Item name="authType" rules={[{ required: true }]} noStyle>
              <Input type="hidden" />
            </Form.Item>

            <div className="nsm-auth-tabs">
              <button
                type="button"
                className={'nsm-auth-tab ' + (authType === 'password' ? 'active' : '')}
                onClick={() => form.setFieldValue('authType', 'password')}
              >
                密码认证
              </button>
              <button
                type="button"
                className={'nsm-auth-tab ' + (authType === 'privateKey' ? 'active' : '')}
                onClick={() => form.setFieldValue('authType', 'privateKey')}
              >
                密钥认证
              </button>
            </div>

            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input placeholder="root" />
            </Form.Item>

            {authType === 'password' ? (
              <Form.Item
                name="password"
                label="密码"
              >
                <Input.Password placeholder="不填写则连接时输入" />
              </Form.Item>
            ) : (
              <Form.Item
                name="privateKey"
                label="私钥文件"
              >
                <div className="nsm-key-file">
                  <div className={'nsm-key-file-path ' + (keyFilePath ? 'has-file' : '')}>
                    {keyFilePath ? keyFilePath.split(/[/\\]/).pop() : <span className="placeholder">未选择密钥文件</span>}
                  </div>
                  <Button icon={<FolderOpenOutlined />} onClick={handleSelectKeyFile}>
                    选择文件
                  </Button>
                </div>
              </Form.Item>
            )}

            {authType === 'privateKey' && (
              <Form.Item name="passphrase" label="私钥密码">
                <Input.Password placeholder="如果私钥有密码，请输入" />
              </Form.Item>
            )}

            <Form.Item name="rememberPassword" valuePropName="checked" style={{ marginBottom: 12 }}>
              <Checkbox>记住密码</Checkbox>
            </Form.Item>

            <div className="nsm-row">
              <Form.Item name="groupId" label="分组">
                <TreeSelect
                  allowClear
                  placeholder="选择分组"
                  treeData={groupTreeData}
                  treeDefaultExpandAll
                  style={{ width: '100%', height: '36px' }}
                />
              </Form.Item>
              <Form.Item name="description" label="描述">
                <Input placeholder="可选备注" />
              </Form.Item>
            </div>

          </Form>
        </div>

        <div className="nsm-footer">
          <Button
            className={testBtnClass}
            onClick={handleTestConnection}
            loading={testStatus === 'testing'}
            icon={testBtnIcon}
          >
            {testStatus === 'testing' ? '测试中...' : testStatus === 'success' ? '连接成功' : testStatus === 'error' ? '连接失败' : '测试连接'}
          </Button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={onClose} className="nsm-cancel-btn">
              取消
            </Button>
            <Button type="primary" onClick={handleOk} className="nsm-ok-btn">
              {editData ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default NewSessionModal