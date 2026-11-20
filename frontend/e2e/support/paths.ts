import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SUPPORT_DIR = dirname(fileURLToPath(import.meta.url))

export const E2E_DIR = resolve(SUPPORT_DIR, '..')
export const FRONTEND_DIR = resolve(E2E_DIR, '..')
export const WORKSPACE_DIR = resolve(FRONTEND_DIR, '..')
export const STATE_DIR = join(E2E_DIR, '.state')
export const STATE_FILE = join(STATE_DIR, 'stack.json')
export const REPORT_DIR = join(E2E_DIR, 'report')