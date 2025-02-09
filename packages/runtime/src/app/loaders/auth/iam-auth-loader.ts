import { AppLoaderType } from '../../../consts'
import { uniqId, _, reloadUrl } from '../../../utils'
import { HostApp } from '../../HostApp'

import type { AppAuthLoader, NavMenuItem } from '../../../typings'
import type { App } from '../../App'

/** iam菜单项 */
interface IAMMenuItem {
  menuId: string // 菜单id
  parentMenuId: number // 父级菜单id
  menuName: string // 菜单名称（标题）
  keyName: string // 菜单编号
  icon: string // 菜单图标
  name: string // 权限名称
  path: string // 菜单链接
  ordinal: number // 排序号
  children?: IAMMenuItem[] // 子菜单

  [prop: string]: any
}

export const IAMAuthLoader: AppAuthLoader = {
  type: AppLoaderType.AUTH,

  name: 'iam',

  // 检查用户权限
  async checkAuth(app: App) {
    // 从url获取code
    const searchParams = new URL(window.location.href).searchParams
    const code = searchParams.get('code')

    // 刷新token
    if (code) {
      // 刷新并设置token
      await app.token.refresh(code)
    } else {
      // 重设token
      await app.token.reset()
    }

    if (!app.token.getAccessToken()) {
      await app.logout()
    } else if (code) {
      await reloadUrl()
    }
  },

  // 获取用户信息
  async getUserInfo(app: App) {
    const { authApi } = app.apis

    if (!authApi.getUserInfo) {
      throw new Error('当前接口没有定义获取用户信息方法，请在接口中添加getUserInfo方法')
    }

    const res = await authApi.getUserInfo()

    return res
  },

  // 解析菜单数据
  async getMenuData(app: App) {
    const menus = app.stores.userStore.menus || []

    const navMenus = menus.map((it: any) => {
      return parseMenuItem(it)
    })

    return navMenus
  },

  async logout(app: App, args: any) {
    if (!app.isIndependent && HostApp.loaded) {
      await HostApp.logout()
      return
    }

    const { authApi } = app.apis

    if (authApi.logout) {
      await authApi.logout(args)
    } else {
      await iamLogout(app)
    }
  },

  async iamLogout(app: App) {
    return iamLogout(app)
  }
}

/** iam登出 */
async function iamLogout(app: App) {
  const ENV = app.env

  await app.token.clearData()

  const redirectUrl = encodeURIComponent(window.location.origin)
  const loginUrl = `${ENV.iamUrl}/oauth2?app_id=${ENV.appId}&redirect_url=${redirectUrl}&state=${uniqId()}`

  await reloadUrl(loginUrl)
}

// 解析单项菜单
function parseMenuItem(menu: IAMMenuItem): NavMenuItem {
  const children = (menu.children || []).map(it => {
    it.parentName = menu.keyName
    return parseMenuItem(it)
  })

  // 原始菜单数据(忽略children项)
  const data = _.omit(menu, ['children'])

  return {
    name: menu.keyName,
    parentName: menu.parentName,
    title: menu.menuName,
    icon: menu.icon,
    path: menu.path,
    order: menu.order || menu.ordinal || 0,
    data,
    children
  }
}
