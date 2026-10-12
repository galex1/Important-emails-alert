(function (global) {
  const STRINGS = {
    en: {
      appName: 'Important e-mails alert',
      tabInbox: 'Inbox',
      tabRead: 'Read',
      tabSpam: 'Spam',
      tabSettings: 'Settings',
      tabLogs: 'Logs',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeSystem: 'System',
      themeAria: 'Theme',
      pollNow: 'Check now',
      markAllRead: 'Mark all read',
      searchUnread: 'Search unread…',
      searchRead: 'Search read…',
      searchSpam: 'Search spam…',
      waitingConfirm: '{n} waiting for confirmation',
      emptyInbox: 'No unread important emails.',
      emptyRead: 'No read emails.',
      emptySpam: 'No spam emails.',
      noResults: 'No results for “{q}”.',
      readCount: '{n} read',
      spamCount: '{n} spam',
      resultsCount: '{n} results',
      markSeen: 'Seen',
      markUnseen: 'Restore',
      markSpam: 'Spam',
      notSpam: 'Not spam',
      blockedSenders: 'Blocked senders',
      unblock: 'Unblock',
      noBlocked: 'No blocked senders.',
      appearance: 'Appearance',
      language: 'Language',
      theme: 'Theme',
      popAccount: 'POP account',
      host: 'Server',
      port: 'Port',
      tls: 'TLS (POP3S)',
      user: 'User / email',
      password: 'Password',
      passwordSetHint: 'Password is already stored. Enter a new one only to change it.',
      passwordEmptyHint: 'Stored locally in the app SQLite database.',
      passwordPlaceholderSet: 'Saved — leave blank to keep',
      passwordPlaceholderNew: 'Password or app password',
      slack: 'Slack',
      slackEnabled: 'Send to a Slack channel',
      slackWebhook: 'Incoming Webhook URL',
      timing: 'Timing',
      pollInterval: 'Check every (sec.)',
      notifyRepeat: 'Repeat notification (sec.)',
      save: 'Save',
      testConnection: 'Test connection',
      savedOk: 'Saved to the database.',
      testOk: 'Connection OK — {n} messages in mailbox.',
      refresh: 'Refresh',
      clear: 'Clear',
      autoScroll: 'Auto-scroll',
      statusError: 'Error: {msg}',
      statusOk: 'Last check OK',
      statusUnread: '{n} unread',
    },
    el: {
      appName: 'Important e-mails alert',
      tabInbox: 'Εισερχόμενα',
      tabRead: 'Διαβασμένα',
      tabSpam: 'Spam',
      tabSettings: 'Ρυθμίσεις',
      tabLogs: 'Logs',
      themeLight: 'Light',
      themeDark: 'Dark',
      themeSystem: 'System',
      themeAria: 'Θέμα',
      pollNow: 'Έλεγχος τώρα',
      markAllRead: 'Όλα διαβάστηκαν',
      searchUnread: 'Αναζήτηση σε αδιάβαστα…',
      searchRead: 'Αναζήτηση σε διαβασμένα…',
      searchSpam: 'Αναζήτηση σε spam…',
      waitingConfirm: '{n} σε αναμονή επιβεβαίωσης',
      emptyInbox: 'Δεν υπάρχουν αδιάβαστα σημαντικά emails.',
      emptyRead: 'Δεν υπάρχουν διαβασμένα emails.',
      emptySpam: 'Δεν υπάρχουν spam emails.',
      noResults: 'Κανένα αποτέλεσμα για «{q}».',
      readCount: '{n} διαβασμένα',
      spamCount: '{n} spam',
      resultsCount: '{n} αποτελέσματα',
      markSeen: 'Το είδα',
      markUnseen: 'Επαναφορά',
      markSpam: 'Spam',
      notSpam: 'Όχι spam',
      blockedSenders: 'Μπλοκαρισμένοι αποστολείς',
      unblock: 'Ξεμπλοκάρισμα',
      noBlocked: 'Κανένας μπλοκαρισμένος αποστολέας.',
      appearance: 'Εμφάνιση',
      language: 'Γλώσσα',
      theme: 'Θέμα',
      popAccount: 'Λογαριασμός POP',
      host: 'Διακομιστής',
      port: 'Θύρα',
      tls: 'TLS (POP3S)',
      user: 'Χρήστης / email',
      password: 'Κωδικός',
      passwordSetHint: 'Ο κωδικός είναι ήδη στη βάση. Συμπλήρωσε νέο μόνο αν θέλεις αλλαγή.',
      passwordEmptyHint: 'Αποθηκεύεται τοπικά στη SQLite της εφαρμογής.',
      passwordPlaceholderSet: 'Αποθηκευμένος — άφησέ το κενό για να μείνει',
      passwordPlaceholderNew: 'Κωδικός ή app password',
      slack: 'Slack',
      slackEnabled: 'Αποστολή σε κανάλι Slack',
      slackWebhook: 'Incoming Webhook URL',
      timing: 'Χρονισμός',
      pollInterval: 'Έλεγχος κάθε (δευτ.)',
      notifyRepeat: 'Επανάληψη ειδοποίησης (δευτ.)',
      save: 'Αποθήκευση',
      testConnection: 'Δοκιμή σύνδεσης',
      savedOk: 'Αποθηκεύτηκε στη βάση.',
      testOk: 'Σύνδεση OK — {n} μηνύματα στο mailbox.',
      refresh: 'Ανανέωση',
      clear: 'Καθαρισμός',
      autoScroll: 'Auto-scroll',
      statusError: 'Σφάλμα: {msg}',
      statusOk: 'Τελευταίος έλεγχος ΟΚ',
      statusUnread: '{n} αδιάβαστα',
    },
  };

  let currentLang = 'el';

  function normalizeLang(value) {
    const v = String(value || 'el').toLowerCase();
    return v === 'en' || v === 'el' ? v : 'el';
  }

  function setLang(lang) {
    currentLang = normalizeLang(lang);
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  function t(key, vars) {
    const table = STRINGS[currentLang] || STRINGS.el;
    let s = table[key] ?? STRINGS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
      }
    }
    return s;
  }

  function applyDom() {
    document.documentElement.lang = currentLang;
    document.title = t('appName');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
  }

  global.I18n = { t, setLang, getLang, applyDom, normalizeLang };
})(window);
