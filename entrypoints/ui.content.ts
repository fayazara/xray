import {
  enabledItem,
  displayModeItem,
  newAccountEnabledItem,
  newAccountDaysItem,
  followsYouEnabledItem,
  personalProfilesItem,
  type DisplayMode,
  type PersonalProfiles,
} from '@/utils/settings';

interface UserInfo {
  followers?: number;
  createdAt?: number; // ms epoch
  followsYou?: boolean;
}

// Runs in the isolated world (default). Receives user data from the MAIN-world
// interceptor via window.postMessage, reads the user's preferences from
// storage, and injects badges into the timeline.
export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_start',
  async main() {
    // screen_name (lowercased) -> info
    const users = new Map<string, UserInfo>();

    let enabled = await enabledItem.getValue();
    let displayMode: DisplayMode = await displayModeItem.getValue();
    let newAccountEnabled = await newAccountEnabledItem.getValue();
    let newAccountDays = await newAccountDaysItem.getValue();
    let followsYouEnabled = await followsYouEnabledItem.getValue();
    let personalProfiles: PersonalProfiles =
      await personalProfilesItem.getValue();

    // ---- receive data from the MAIN-world interceptor -------------------
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__xrayFollowers !== true) return;
      if (typeof data.screenName !== 'string') return;

      const key = data.screenName.toLowerCase();
      const prev = users.get(key) ?? {};
      const next: UserInfo = { ...prev };
      let changed = false;

      if (typeof data.followers === 'number' && prev.followers !== data.followers) {
        next.followers = data.followers;
        changed = true;
      }
      if (typeof data.createdAt === 'number' && prev.createdAt !== data.createdAt) {
        next.createdAt = data.createdAt;
        changed = true;
      }
      if (typeof data.followsYou === 'boolean' && prev.followsYou !== data.followsYou) {
        next.followsYou = data.followsYou;
        changed = true;
      }

      if (changed) {
        users.set(key, next);
        scheduleInject();
      }
    });

    // ---- react to settings changing ------------------------------------
    enabledItem.watch((v) => {
      enabled = v;
      if (enabled) scheduleInject();
      else removeAllBadges();
    });
    displayModeItem.watch((v) => {
      displayMode = v;
      scheduleInject();
    });
    newAccountEnabledItem.watch((v) => {
      newAccountEnabled = v;
      scheduleInject();
    });
    newAccountDaysItem.watch((v) => {
      newAccountDays = v;
      scheduleInject();
    });
    followsYouEnabledItem.watch((v) => {
      followsYouEnabled = v;
      scheduleInject();
    });
    personalProfilesItem.watch((v) => {
      personalProfiles = v;
      scheduleInject();
    });

    // ---------------------------------------------------------------------
    // Formatting helpers
    // ---------------------------------------------------------------------
    const FONT_FAMILY =
      'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

    const INFO_ICON =
      '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" aria-hidden="true" style="flex:none"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>';

    function formatCount(n: number): string {
      if (n >= 1_000_000)
        return (
          (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') +
          'M'
        );
      if (n >= 1_000)
        return (
          (n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'K'
        );
      return String(n);
    }

    function followersLabel(count: number): string {
      const num = formatCount(count);
      return displayMode === 'compact' ? `· ${num}` : `· ${num} followers`;
    }

    function ageLabel(createdAt: number): string {
      const days = Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
      if (days < 31) return `${days}d`;
      const months = Math.floor(days / 30);
      if (months < 12) return `${months}mo`;
      return `${Math.floor(days / 365)}y`;
    }

    function joinedTitle(createdAt: number): string {
      const date = new Date(createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      return `New account · joined ${date} (${ageLabel(createdAt)} ago)`;
    }

    // ---------------------------------------------------------------------
    // Personal tags and notes
    // ---------------------------------------------------------------------
    const MAX_TAGS = 5;
    const MAX_TAG_LENGTH = 24;
    const MAX_NOTE_LENGTH = 500;

    let activeEditor: { host: HTMLElement } | undefined;

    function normalizeTags(tags: string[]): string[] {
      const normalized: string[] = [];
      const seen = new Set<string>();
      for (const raw of tags) {
        const tag = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
        const key = tag.toLowerCase();
        if (!tag || seen.has(key)) continue;
        seen.add(key);
        normalized.push(tag);
        if (normalized.length === MAX_TAGS) break;
      }
      return normalized;
    }

    async function savePersonalProfile(
      handle: string,
      tags: string[],
      note: string,
    ) {
      const key = handle.toLowerCase();
      const cleanTags = normalizeTags(tags);
      const cleanNote = note.trim().slice(0, MAX_NOTE_LENGTH);
      const previous = personalProfiles;
      const next = { ...(await personalProfilesItem.getValue()) };

      if (cleanTags.length === 0 && cleanNote.length === 0) delete next[key];
      else {
        next[key] = {
          tags: cleanTags,
          note: cleanNote,
          updatedAt: Date.now(),
        };
      }

      personalProfiles = next;
      scheduleInject();
      try {
        await personalProfilesItem.setValue(next);
      } catch (error) {
        personalProfiles = previous;
        scheduleInject();
        throw error;
      }
    }

    function closePersonalEditor() {
      activeEditor?.host.remove();
      activeEditor = undefined;
    }

    function themeTokens() {
      const background = getComputedStyle(document.body).backgroundColor;
      const values = background.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255];
      const luminance =
        values[0] * 0.299 + values[1] * 0.587 + values[2] * 0.114;
      const dark = luminance < 150;
      return dark
        ? {
            background,
            foreground: 'rgb(231, 233, 234)',
            muted: 'rgb(113, 118, 123)',
            border: 'rgb(47, 51, 54)',
            surface: 'rgb(22, 24, 28)',
            button: 'rgb(239, 243, 244)',
            buttonText: 'rgb(15, 20, 25)',
          }
        : {
            background,
            foreground: 'rgb(15, 20, 25)',
            muted: 'rgb(83, 100, 113)',
            border: 'rgb(207, 217, 222)',
            surface: 'rgb(247, 249, 249)',
            button: 'rgb(15, 20, 25)',
            buttonText: 'rgb(255, 255, 255)',
          };
    }

    function positionEditor(host: HTMLElement, trigger: HTMLElement) {
      const triggerRect = trigger.getBoundingClientRect();
      const editorRect = host.getBoundingClientRect();
      const edge = 12;
      const left = Math.min(
        Math.max(edge, triggerRect.left),
        window.innerWidth - editorRect.width - edge,
      );
      const below = triggerRect.bottom + 8;
      const top =
        below + editorRect.height <= window.innerHeight - edge
          ? below
          : Math.max(edge, triggerRect.top - editorRect.height - 8);
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    }

    function openPersonalEditor(handle: string, trigger: HTMLElement) {
      closePersonalEditor();

      const key = handle.toLowerCase();
      const profile = personalProfiles[key];
      let draftTags = [...(profile?.tags ?? [])];
      const tokens = themeTokens();
      const host = document.createElement('div');
      host.className = 'xray-personal-editor-root';
      host.style.cssText = [
        'position:fixed',
        'z-index:2147483647',
        'width:min(320px,calc(100vw - 24px))',
        'left:12px',
        'top:12px',
      ].join(';');
      host.style.setProperty('--xray-editor-bg', tokens.background);
      host.style.setProperty('--xray-editor-fg', tokens.foreground);
      host.style.setProperty('--xray-editor-muted', tokens.muted);
      host.style.setProperty('--xray-editor-border', tokens.border);
      host.style.setProperty('--xray-editor-surface', tokens.surface);
      host.style.setProperty('--xray-editor-button', tokens.button);
      host.style.setProperty('--xray-editor-button-text', tokens.buttonText);

      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          * { box-sizing: border-box; }
          .panel {
            padding: 16px;
            border: 1px solid var(--xray-editor-border);
            border-radius: 16px;
            background: var(--xray-editor-bg);
            color: var(--xray-editor-fg);
            box-shadow: 0 8px 28px rgba(0, 0, 0, .22);
            font-family: ${FONT_FAMILY};
            font-size: 15px;
            line-height: 20px;
          }
          .header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
          .title { margin:0; font-size:17px; font-weight:700; line-height:22px; }
          .privacy { margin-top:1px; color:var(--xray-editor-muted); font-size:12px; line-height:16px; }
          .close {
            display:grid; place-items:center; flex:none; width:32px; height:32px;
            margin:-6px -6px 0 0; padding:0; border:0; border-radius:999px;
            color:var(--xray-editor-fg); background:transparent; cursor:pointer;
          }
          .close:hover { background:var(--xray-editor-surface); }
          .field { display:block; margin-top:16px; }
          .label { display:block; margin-bottom:6px; font-size:13px; font-weight:700; }
          .chip-editor {
            display:flex; align-items:center; flex-wrap:wrap; gap:5px; min-height:42px;
            padding:6px 9px; border:1px solid var(--xray-editor-border);
            border-radius:10px; background:transparent;
          }
          .chip-editor:focus-within { border-color:rgb(29,155,240); box-shadow:0 0 0 1px rgb(29,155,240); }
          .chips { display:contents; }
          .chip {
            display:inline-flex; align-items:center; gap:3px; max-width:100%; height:25px;
            padding:0 4px 0 8px; border-radius:999px; color:rgb(29,155,240);
            background:rgba(29,155,240,.1); font-size:12px; font-weight:600;
          }
          .chip-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .remove {
            display:grid; place-items:center; width:18px; height:18px; padding:0;
            border:0; border-radius:999px; color:inherit; background:transparent;
            font:inherit; line-height:1; cursor:pointer;
          }
          .remove:hover { background:rgba(29,155,240,.14); }
          .tag-input {
            flex:1 1 92px; min-width:80px; height:27px; padding:0; border:0;
            outline:0; color:var(--xray-editor-fg); background:transparent;
            font:inherit; font-size:14px;
          }
          .tag-input::placeholder, .note::placeholder { color:var(--xray-editor-muted); opacity:1; }
          .help { margin-top:5px; color:var(--xray-editor-muted); font-size:11px; line-height:15px; }
          .note {
            display:block; width:100%; min-height:88px; resize:vertical; padding:10px 11px;
            border:1px solid var(--xray-editor-border); border-radius:10px; outline:0;
            color:var(--xray-editor-fg); background:transparent; font-family:inherit;
            font-size:14px; line-height:19px;
          }
          .note:focus { border-color:rgb(29,155,240); box-shadow:0 0 0 1px rgb(29,155,240); }
          .footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; }
          .local { color:var(--xray-editor-muted); font-size:11px; line-height:14px; }
          .save {
            min-width:72px; height:36px; padding:0 16px; border:0; border-radius:999px;
            color:var(--xray-editor-button-text); background:var(--xray-editor-button);
            font:inherit; font-size:14px; font-weight:700; cursor:pointer;
          }
          .save:disabled { opacity:.55; cursor:default; }
          .error { display:none; margin-top:8px; color:rgb(244,33,46); font-size:12px; }
        </style>
        <form class="panel" role="dialog" aria-label="Personal tags and note">
          <div class="header">
            <div>
              <h2 class="title"></h2>
              <div class="privacy">Personal context</div>
            </div>
            <button class="close" type="button" aria-label="Close">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <label class="field">
            <span class="label">Tags</span>
            <span class="chip-editor">
              <span class="chips"></span>
              <input class="tag-input" maxlength="${MAX_TAG_LENGTH}" placeholder="Add a tag" autocomplete="off" />
            </span>
            <span class="help">Press Enter or comma · up to ${MAX_TAGS} tags</span>
          </label>
          <label class="field">
            <span class="label">Private note</span>
            <textarea class="note" maxlength="${MAX_NOTE_LENGTH}" placeholder="What should you remember?"></textarea>
          </label>
          <div class="error">Couldn’t save. Try again.</div>
          <div class="footer">
            <span class="local">Stored only in this browser</span>
            <button class="save" type="submit">Save</button>
          </div>
        </form>
      `;

      const form = shadow.querySelector<HTMLFormElement>('form')!;
      const title = shadow.querySelector<HTMLElement>('.title')!;
      const chips = shadow.querySelector<HTMLElement>('.chips')!;
      const tagInput = shadow.querySelector<HTMLInputElement>('.tag-input')!;
      const noteInput = shadow.querySelector<HTMLTextAreaElement>('.note')!;
      const saveButton = shadow.querySelector<HTMLButtonElement>('.save')!;
      const error = shadow.querySelector<HTMLElement>('.error')!;
      title.textContent = `@${handle}`;
      noteInput.value = profile?.note ?? '';

      function renderDraftTags() {
        chips.replaceChildren();
        for (const tag of draftTags) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          const text = document.createElement('span');
          text.className = 'chip-text';
          text.textContent = tag;
          const remove = document.createElement('button');
          remove.className = 'remove';
          remove.type = 'button';
          remove.ariaLabel = `Remove ${tag}`;
          remove.textContent = '×';
          remove.addEventListener('click', () => {
            draftTags = draftTags.filter((item) => item !== tag);
            renderDraftTags();
            tagInput.focus();
          });
          chip.append(text, remove);
          chips.appendChild(chip);
        }
        tagInput.disabled = draftTags.length >= MAX_TAGS;
        tagInput.placeholder = draftTags.length === 0 ? 'Add a tag' : '';
      }

      function commitTagInput() {
        if (!tagInput.value.trim()) return;
        draftTags = normalizeTags([...draftTags, ...tagInput.value.split(',')]);
        tagInput.value = '';
        renderDraftTags();
      }

      tagInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ',') {
          event.preventDefault();
          commitTagInput();
        } else if (
          event.key === 'Backspace' &&
          tagInput.value === '' &&
          draftTags.length > 0
        ) {
          draftTags = draftTags.slice(0, -1);
          renderDraftTags();
        }
      });
      tagInput.addEventListener('input', () => {
        if (tagInput.value.includes(',')) commitTagInput();
      });
      shadow.querySelector<HTMLButtonElement>('.close')!.addEventListener(
        'click',
        closePersonalEditor,
      );
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        commitTagInput();
        saveButton.disabled = true;
        saveButton.textContent = 'Saving…';
        error.style.display = 'none';
        void savePersonalProfile(handle, draftTags, noteInput.value)
          .then(closePersonalEditor)
          .catch(() => {
            saveButton.disabled = false;
            saveButton.textContent = 'Save';
            error.style.display = 'block';
          });
      });

      renderDraftTags();
      document.body.appendChild(host);
      activeEditor = { host };
      positionEditor(host, trigger);
      tagInput.focus();
    }

    function configurePersonalTrigger(
      trigger: HTMLElement,
      handle: string,
      description: string,
    ) {
      const hasContext = personalProfiles[handle.toLowerCase()] !== undefined;
      trigger.classList.add('xray-personal-trigger');
      trigger.dataset.xrayHandle = handle;
      trigger.style.cursor = 'pointer';
      trigger.title = `${description} · Click to ${hasContext ? 'edit' : 'add'} private tags and note`;
    }

    function renderPersonalContext(
      host: HTMLElement,
      handle: string,
      fontSize: string,
    ) {
      const profile = personalProfiles[handle.toLowerCase()];
      let badge = host.querySelector<HTMLElement>('.xray-personal-context');
      if (!profile) {
        badge?.remove();
        return;
      }

      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'xray-personal-context';
        badge.style.cssText = [
          `font-family:${FONT_FAMILY}`,
          'display:inline-flex',
          'align-items:center',
          'align-self:center',
          'gap:3px',
          'margin-left:6px',
          'padding:0 6px',
          'height:1.45em',
          'border-radius:4px',
          `font-size:${fontSize}`,
          'font-weight:500',
          'line-height:1',
          'color:inherit',
          'background:rgba(127,127,127,0.2)',
          'white-space:nowrap',
          'vertical-align:middle',
        ].join(';');
        host.appendChild(badge);
      }

      badge.replaceChildren();
      const label = document.createElement('span');
      label.style.cssText = [
        'display:block',
        'max-width:88px',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
      ].join(';');
      label.textContent =
        profile.tags.length > 0
          ? `${profile.tags[0]}${profile.tags.length > 1 ? ` +${profile.tags.length - 1}` : ''}`
          : 'Note';
      badge.appendChild(label);
      const description =
        profile.tags.length > 0
          ? `Personal tag: ${profile.tags.join(', ')}${profile.note ? ' · Has private note' : ''}`
          : 'Has private note';
      configurePersonalTrigger(badge, handle, description);
    }

    function handlePersonalTriggerClick(event: MouseEvent) {
      const path = event.composedPath();
      if (activeEditor && path.includes(activeEditor.host)) return;
      const target = event.target;
      const trigger =
        target instanceof Element
          ? target.closest<HTMLElement>('.xray-personal-trigger')
          : null;
      if (trigger?.dataset.xrayHandle) {
        event.preventDefault();
        event.stopPropagation();
        openPersonalEditor(trigger.dataset.xrayHandle, trigger);
      } else if (activeEditor) closePersonalEditor();
    }

    function handleEditorKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !activeEditor) return;
      event.preventDefault();
      event.stopPropagation();
      closePersonalEditor();
    }

    // ---------------------------------------------------------------------
    // Handle extraction
    // ---------------------------------------------------------------------
    const HREF_RE = /^\/([A-Za-z0-9_]{1,15})$/;
    const AT_RE = /^@([A-Za-z0-9_]{1,15})$/;

    // Returns the screen name plus the element the badges should be appended
    // to. We prefer the "@handle" line so badges stay inline even on the
    // tweet-detail page (where User-Name is a vertical column).
    function findHandleParts(
      el: HTMLElement,
    ): { handle: string; host: HTMLElement } | null {
      const spans = el.querySelectorAll<HTMLElement>('span');
      for (const span of spans) {
        const m = (span.textContent || '').match(AT_RE);
        if (m) return { handle: m[1], host: span.parentElement ?? el };
      }
      const links = el.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
      for (const link of links) {
        const m = (link.getAttribute('href') || '').match(HREF_RE);
        if (m) return { handle: m[1], host: el };
      }
      return null;
    }

    // ---------------------------------------------------------------------
    // Badge rendering (idempotent — safe to call every frame)
    // ---------------------------------------------------------------------
    const resolved = new WeakMap<HTMLElement, { host: HTMLElement; handle: string }>();

    function renderFollowers(
      host: HTMLElement,
      info: UserInfo,
      fontSize: string,
      handle: string,
    ) {
      if (info.followers !== undefined) {
        let badge = host.querySelector<HTMLElement>('.xray-followers');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'xray-followers';
          badge.style.cssText = [
            `font-family:${FONT_FAMILY}`,
            `font-size:${fontSize}`,
            'font-weight:400',
            'margin-left:4px',
            'color:inherit',
            'white-space:nowrap',
          ].join(';');
          host.appendChild(badge);
        }
        const label = followersLabel(info.followers);
        if (badge.textContent !== label) {
          badge.textContent = label;
        }
        configurePersonalTrigger(
          badge,
          handle,
          `${info.followers.toLocaleString()} followers`,
        );
      }
    }

    function renderHost(
      host: HTMLElement,
      info: UserInfo,
      fontSize: string,
      handle: string,
    ) {
      // --- followers ---
      renderFollowers(host, info, fontSize, handle);

      // --- new account ---
      const isNew =
        newAccountEnabled &&
        info.createdAt !== undefined &&
        Date.now() - info.createdAt < newAccountDays * 86_400_000;
      let newBadge = host.querySelector<HTMLElement>('.xray-newacct');
      if (isNew) {
        if (!newBadge) {
          newBadge = document.createElement('span');
          newBadge.className = 'xray-newacct';
          newBadge.style.cssText = [
            `font-family:${FONT_FAMILY}`,
            'display:inline-flex',
            'align-items:center',
            'align-self:center',
            'gap:2px',
            'margin-left:6px',
            'padding:0 6px',
            'height:1.25em',
            'border-radius:4px',
            'font-size:12px',
            'font-weight:600',
            'line-height:1',
            'color:rgb(29,155,240)',
            'background:rgba(29,155,240,0.1)',
            'white-space:nowrap',
            'vertical-align:middle',
          ].join(';');
          newBadge.innerHTML = INFO_ICON;
          newBadge.appendChild(document.createElement('span'));
          host.appendChild(newBadge);
        }
        const text = newBadge.lastElementChild as HTMLElement;
        const label = ageLabel(info.createdAt!);
        if (text.textContent !== label) text.textContent = label;
        newBadge.title = joinedTitle(info.createdAt!);
      } else if (newBadge) {
        newBadge.remove();
      }

      // --- follows you ---
      const showFollows = followsYouEnabled && info.followsYou === true;
      let followsBadge = host.querySelector<HTMLElement>('.xray-followsyou');
      if (showFollows) {
        if (!followsBadge) {
          followsBadge = document.createElement('span');
          followsBadge.className = 'xray-followsyou';
          followsBadge.textContent = 'Follows you';
          followsBadge.style.cssText = [
            `font-family:${FONT_FAMILY}`,
            'display:inline-flex',
            'align-items:center',
            'align-self:center',
            'margin-left:6px',
            'padding:0 6px',
            'height:1.45em',
            'border-radius:4px',
            'font-size:11px',
            'font-weight:500',
            'line-height:1',
            'color:inherit',
            'background:rgba(127,127,127,0.2)',
            'white-space:nowrap',
            'vertical-align:middle',
          ].join(';');
          host.appendChild(followsBadge);
        }
      } else if (followsBadge) {
        followsBadge.remove();
      }
    }

    // Tweet authors (regular + quoted tweets + detail view).
    function injectNames() {
      const nameEls = document.querySelectorAll<HTMLElement>(
        '[data-testid="User-Name"]',
      );
      for (const el of nameEls) {
        let entry = resolved.get(el);
        if (!entry) {
          const parts = findHandleParts(el);
          if (!parts) continue;
          entry = parts;
          resolved.set(el, entry);
        }
        const info = users.get(entry.handle.toLowerCase());
        if (info) renderHost(entry.host, info, '15px', entry.handle);
        renderPersonalContext(entry.host, entry.handle, '12px');
      }
    }

    // "X reposted" headers — show the reposter's stats.
    function injectReposts() {
      const ctxEls = document.querySelectorAll<HTMLElement>(
        '[data-testid="socialContext"]',
      );
      for (const el of ctxEls) {
        let entry = resolved.get(el);
        if (!entry) {
          const anchor = el.closest<HTMLAnchorElement>('a[href^="/"]');
          const m = anchor?.getAttribute('href')?.match(HREF_RE);
          if (!m) continue; // e.g. "You reposted" has no profile link
          entry = { handle: m[1], host: el };
          resolved.set(el, entry);
        }
        const info = users.get(entry.handle.toLowerCase());
        if (info) renderHost(entry.host, info, '13px', entry.handle);
        renderPersonalContext(entry.host, entry.handle, '11px');
      }
    }

    // User cards in follower/following lists and the "Who to follow" module.
    // Both surfaces use UserCell, even though one is a button and the other a
    // list item. Render only the follower count here because X can already
    // include its own "Follows you" indicator inside these cards.
    function injectUserCells() {
      const cells = document.querySelectorAll<HTMLElement>(
        '[data-testid="UserCell"]',
      );
      for (const cell of cells) {
        let entry = resolved.get(cell);
        if (!entry) {
          const parts = findHandleParts(cell);
          if (!parts) continue;
          entry = parts;
          resolved.set(cell, entry);
        }
        const info = users.get(entry.handle.toLowerCase());
        if (info) renderFollowers(entry.host, info, '15px', entry.handle);
        renderPersonalContext(entry.host, entry.handle, '11px');
      }
    }

    // Strip everything XRay added, used when the extension is switched off.
    function removeAllBadges() {
      closePersonalEditor();
      document
        .querySelectorAll(
          '.xray-followers, .xray-newacct, .xray-followsyou, .xray-personal-context',
        )
        .forEach((el) => el.remove());
    }

    function injectBadges() {
      if (!enabled) return;
      injectNames();
      injectReposts();
      injectUserCells();
    }

    let scheduled = false;
    function scheduleInject() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        injectBadges();
      });
    }

    function start() {
      injectBadges();
      document.addEventListener('click', handlePersonalTriggerClick, true);
      document.addEventListener('keydown', handleEditorKeydown, true);
      window.addEventListener('resize', closePersonalEditor);
      window.addEventListener('scroll', closePersonalEditor);
      const observer = new MutationObserver(() => scheduleInject());
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  },
});
