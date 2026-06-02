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
  --van-dialog-header-font-weight: 600;
  --van-action-sheet-header-font-weight: 600;
}
</style>
