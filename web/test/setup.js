import { config } from '@vue/test-utils'

config.global.stubs = {
  ...(config.global.stubs ?? {}),
  'van-icon': {
    template: '<span aria-hidden="true"><slot /></span>',
  },
  'van-loading': {
    template: '<span><slot /></span>',
  },
}
