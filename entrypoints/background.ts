import { enabledItem } from '@/utils/settings';

export default defineBackground(() => {
  // Show an "OFF" badge on the toolbar icon while XRay is disabled.
  function updateBadge(enabled: boolean) {
    browser.action.setBadgeText({ text: enabled ? '' : 'OFF' });
    browser.action.setBadgeBackgroundColor({ color: '#536471' });
  }

  enabledItem.getValue().then(updateBadge);
  enabledItem.watch(updateBadge);
});
