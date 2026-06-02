<template>
  <router-view />
</template>

<script setup>
// 根组件 - 路由驱动页面切换
</script>

<style>
@import url('./styles/variables.css');

* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  background-color: #f5f5f7;
  font-family: var(--font-family);
  color: var(--text-primary);
}

#app {
  max-width: 100%;
  min-height: 100vh;
}

@media (min-width: 768px) {
  body {
    background-color: #e8ebf0;
  }

  #app {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--bg-page);
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.1);
    position: relative;
  }
}

/* Vant 组件全局样式覆盖 */
:root {
  --van-nav-bar-title-font-size: 17px;
  --van-nav-bar-title-text-color: #1d1d1f;
  --van-nav-bar-icon-color: var(--color-primary);
  --van-button-primary-background: var(--color-primary);
  --van-button-primary-border-color: var(--color-primary);
  --van-button-primary-height: 48px;
  --van-button-primary-border-radius: 24px;
  --van-button-default-height: 48px;
  --van-button-default-border-radius: 24px;
  --van-cell-vertical-padding: 14px;
  --van-field-label-color: var(--text-secondary);
  --van-field-input-text-color: var(--text-primary);
  --van-field-placeholder-text-color: #aeaeb2;
  --van-tab-font-size: 14px;
  --van-tabs-bottom-bar-height: 3px;
  --van-tabs-bottom-bar-border-radius: 1.5px;
  --van-loading-text-color: var(--text-secondary);
  --van-loading-text-font-size: 14px;
  /* ======== Dialog 对话框 ======== */
  --van-dialog-background: #ffffff;
  --van-dialog-title-color: #1d1d1f;
  --van-dialog-content-text-color: #1d1d1f;
  --van-dialog-header-font-weight: 600;
  --van-dialog-confirm-button-text-color: var(--color-primary);
  --van-dialog-cancel-button-text-color: #86868b;

  /* ======== Action Sheet 底部弹窗 ======== */
  --van-action-sheet-background: #ffffff;
  --van-action-sheet-header-text-color: #1d1d1f;
  --van-action-sheet-item-text-color: #1d1d1f;
  --van-action-sheet-item-background: #ffffff;
  --van-action-sheet-cancel-text-color: #86868b;
  --van-action-sheet-header-font-weight: 600;

  /* ======== Toast 消息提示（深底白字，反差最大） ======== */
  --van-toast-background: rgba(0, 0, 0, 0.85);
  --van-toast-text-color: #ffffff;

  /* ======== Overlay 遮罩层 ======== */
  --van-overlay-background: rgba(0, 0, 0, 0.5);

  /* ======== Popup 弹出层（预留） ======== */
  --van-popup-background: #ffffff;
  --van-popup-border-radius: var(--radius-lg);
}
</style>
