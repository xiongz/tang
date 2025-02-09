<template>
  <c-dialog class="c-import-dialog" ref="dialogRef" v-bind="dialogAttrs">
    <div v-loading="loading" class="import-body-con">
      <div class="trigger-con">
        <c-file-trigger :accept="fileAccept" @file-selected="handleFileSelected">
          <slot name="trigger">
            <el-button type="primary" v-preventReclick>选择文件</el-button>
          </slot>
        </c-file-trigger>
        <div class="file-list-con text-center">
          <c-file-list :model-value="fileList" max-item-width="100%" @delete="handleFileDeleted">
            <template #no-data>请选择要上传的文件文件</template>
          </c-file-list>
        </div>
      </div>

      <div class="tip-con">
        <slot name="tip">
          {{ props.tip || `请先下载模板，数据不能超过${innerMaxCount}条，文件大小不能超过${innerMaxFileSize}MB。` }}
        </slot>
      </div>

      <slot name="extraTip">
        <div v-if="innerExtraTip?.cmpt" class="extra-tip-con">
          <cmpt :config="innerExtraTip?.cmpt"></cmpt>
        </div>
        <div v-if="innerExtraTip?.componentType" class="extra-tip-con">
          <component :is="innerExtraTip?.componentType" v-bind="innerExtraTip"></component>
        </div>
      </slot>

      <div class="footer-con">
        <slot name="footer">
          <div class="template-download">
            <el-button type="text" v-preventReclick @click="handleDownloadTemplate">下载导入模版</el-button>
          </div>
        </slot>
      </div>
    </div>
  </c-dialog>
</template>

<script lang="ts">
export default { inheritAttrs: false }

export interface ImportExtraTip {
  componentType?: string // 组件类型
  html?: Record<string, any> // 展示html
  tpl?: string // 展示模版
  [prop: string]: any
}
</script>

<script setup lang="ts">
import { _, computed, ref, fileUtil, useCurrentAppInstance } from '@zto/zpage'

import * as xlsxUtil from '../../utils/xlsx'

import type { GenericFunction, ApiRequestAction } from '@zto/zpage'

const props = withDefaults(
  defineProps<{
    template: string
    title?: string
    tip?: string
    extraTip?: string | ImportExtraTip
    maxCount?: number
    maxFileSize?: number // 文件大小限制，单位MB
    api?: string | ApiRequestAction
    apiParams?: any
    dataProp?: string // 导出数据的属性
    dialog?: any
    filterEmpty?: boolean
    successMessage?: string
    closeAfterSuccess?: boolean
    dataValidate?: boolean | Function
    parseMethod?: GenericFunction
    importMethod?: GenericFunction
    transformMethod?: GenericFunction
    onSubmit?: GenericFunction
  }>(),
  {
    closeAfterSuccess: true,
    dataProp: 'data',
    filterEmpty: true,
    dataValidate: true
  }
)

const app = useCurrentAppInstance()

const { Message } = app.useMessage()
const apiRequest = app.request

const loading = ref(false)
const dialogRef = ref<any>()

const dialogAttrs = computed(() => {
  return {
    title: props.title,
    width: 600,
    noPadding: true,
    bodyStyle: { padding: '10px 30px' },
    onSubmit: handleDialogSubmit,
    ...props.dialog
  }
})

const fileImportCfg = app.useComponentsConfig('fileImport', {})

const importTemplates = app.useAssets('import_templates', {})

const selectedFile = ref()

const fileList = computed(() => {
  return selectedFile.value ? [selectedFile.value] : []
})

const templateData = computed(() => {
  return importTemplates[props.template]
})

const innerExtraTip = computed(() => {
  const _tip = props.extraTip || templateData.value?.extraTip
  if (!_tip) return null

  let _extraTip: ImportExtraTip = {}

  if (_.isString(_tip)) {
    _extraTip = { componentType: 'c-tpl', tpl: _tip }
  } else if (_tip.tpl) {
    _extraTip = { componentType: 'c-tpl', ..._tip }
  } else if (_tip.html) {
    _extraTip = { componentType: 'c-html', ..._tip }
  } else {
    _extraTip = { ..._tip }
  }

  if (_extraTip.componentType) {
    _extraTip.componentType = app.resolveComponent(_extraTip.componentType)
  }

  return _extraTip
})

const fileAccept = computed(() => {
  return templateData.value?.accept || '.xlsx'
})

const innerMaxCount = computed(() => {
  return props.maxCount || templateData.value?.maxCount || fileImportCfg?.maxCount || 3000
})

const innerMaxFileSize = computed(() => {
  return props.maxFileSize || templateData.value?.maxFileSize || fileImportCfg?.maxFileSize || 10
})

// 文件选中后触发
async function handleFileSelected(file: any) {
  const exceededFileSize = file.size / 1024 / 1024 > innerMaxFileSize.value

  if (exceededFileSize) {
    Message.warning(`文件大小不能超过${innerMaxFileSize.value}MB。`)
    return
  }

  selectedFile.value = file
}

function handleFileDeleted() {
  selectedFile.value = null
}

// 下载模版
function handleDownloadTemplate() {
  const template = templateData.value
  if (!template) {
    throw new Error('请提供当前导入。')
  }

  fileUtil.download(template.url)
}

// 执行提交
async function handleDialogSubmit() {
  const file = selectedFile.value

  if (!selectedFile.value) {
    Message.warning('请先选择要上传的文件。')
    return
  }

  try {
    loading.value = true
    let data = await innerParseMethod(file, {
      filterEmpty: props.filterEmpty
    })

    if (props.dataValidate !== false) {
      if (typeof props.dataValidate === 'function') {
        const flag = await Promise.resolve().then(() => {
          return (props.dataValidate as Function)(data)
        })

        if (flag === false) return
      } else {
        if (!data?.length) throw new Error('没有需要上传的数据。')
        if (data.length > innerMaxCount.value) throw new Error(`数据不能超过${innerMaxCount.value}条`)
      }
    }

    await innerImportMethod(data)

    if (props.successMessage) Message.success(props.successMessage)

    await Promise.resolve().then(() => {
      if (props.onSubmit) return props.onSubmit(data)
    })

    if (props.closeAfterSuccess) {
      clear()
      close()
    }

    loading.value = false
  } catch (err: any) {
    loading.value = false
    Message.error(err.message || '解析或导入数据出错。')
  }
}

async function innerParseMethod(file: any, options: any) {
  const parseMethod = props.parseMethod || fileImportCfg.parseMethod
  if (parseMethod) {
    return parseMethod(file, { ...options, template: templateData.value })
  }
  return doParseFile(file, options)
}

async function innerImportMethod(data: any) {
  const importMethod = props.importMethod || fileImportCfg.importMethod

  let importData = data
  if (props.transformMethod) importData = await props.transformMethod(data)

  let paramsData = props.apiParams
  if (_.isFunction(props.apiParams)) {
    paramsData = props.apiParams({ data, template: templateData.value })
  }

  const payload = {
    [props.dataProp]: importData,
    ...paramsData
  }

  if (importMethod) {
    return importMethod(payload)
  } else if (props.api) {
    return doApiImport(payload)
  }
}

// 解析文件
async function doParseFile(file: any, options?: any) {
  let data: any[] = []
  if (fileImportCfg.parseFile) {
    data = await fileImportCfg.parseFile(file, { app })
  } else {
    data = await xlsxUtil.parseFile(file, { app })
  }

  // 移除第一行
  data.shift()

  if (!data || !data.length) return

  let result = data

  if (options.filterEmpty) {
    result = data.filter((dt: any) => {
      return !!dt.length
    })
  }

  const columns = templateData.value?.columns as any[]

  if (columns?.length) {
    result = result.map((dt: any) => {
      const it: any = {}

      columns.forEach((col, idx) => {
        if (!col) return

        if (typeof col === 'string') {
          col = { prop: col }
        }

        let val = dt[idx]

        if (col.transform) val = col.transform(val)
        if (col.formatter) val = app.formatText(val, col.formatter)

        switch (col.type) {
          case 'number':
            val = parseFloat(val)
            if (isNaN(val)) val = undefined
            break
          case 'int':
          case 'integer':
            val = parseInt(val)
            if (isNaN(val)) val = undefined
            break
          default:
            if (!_.isNil(val)) val = String(val)
            break
        }

        if (col.prop && !_.isNil(val)) {
          it[col.prop] = val
        }
      })
      return it
    })
  }
  return result
}

// 执行导入
async function doApiImport(payload: any) {
  if (!props.api) throw new Error('api不存在')

  await apiRequest({
    action: props.api,
    data: payload,
    isSilent: true // 防止接口出错后，重复弹出提示框
  })
}

function clear() {
  selectedFile.value = null
}

// 显示对话框
function show() {
  dialogRef.value.show()
}

// 关闭对话框
function close() {
  dialogRef.value.close()
}

defineExpose({ show, close, clear })
</script>

<style lang="scss" scoped>
.trigger-con {
  padding: 10px 0;
}

.tip-con,
.extra-tip-con {
  font-size: 12px;
  opacity: 0.8;
  padding: 10px 0;
}

.file-list-con {
  :deep(.file-item) {
    background: white;
  }
}

.template-download {
  text-align: right;
  font-weight: normal;
}
</style>
