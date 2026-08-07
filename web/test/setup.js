import { config } from '@vue/test-utils'

config.global.stubs = {
  ...(config.global.stubs ?? {}),
  'van-icon': true,
  'van-loading': true,
}
