import { stopStack } from './stack'

/** 停进程并清理临时 home/日志目录；E2E_KEEP_STACK=1 时保留现场。 */
export default async function globalTeardown(): Promise<void> {
  await stopStack()
}