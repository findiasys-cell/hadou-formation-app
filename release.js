// 公開更新時はこの日付と history.html の更新内容を同じ変更で更新する。
window.APP_RELEASE = Object.freeze({ updatedOn: '2026-10-28' });
function renderReleaseDate() {
  document.querySelectorAll('[data-release-date]').forEach(el => {
    el.textContent = window.APP_RELEASE.updatedOn.replace(/-/g, '/');
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderReleaseDate, { once: true });
} else {
  renderReleaseDate();
}
