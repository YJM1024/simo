// platform/storage.ts —— localStorage 安全封装（隐私模式/禁用存储时不抛错）

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 存储不可用不应影响主流程
  }
}
